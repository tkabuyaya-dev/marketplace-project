/**
 * NUNULIA — AI Content Moderation pour buyer requests (Claude Haiku 4.5)
 *
 * Appelé par submitBuyerRequest AVANT la création du doc Firestore.
 *
 * Verdict :
 *   - "legit"      → demande publiée normalement
 *   - "borderline" → publiée MAIS avec moderationFlag=true (admin review)
 *   - "reject"     → bloquée, buyer reçoit "Demande refusée"
 *
 * Fail-open : si l'API Anthropic échoue (timeout, down, JSON invalide),
 * on retourne "legit" pour ne pas bloquer 100% des buyers en cas d'incident
 * Anthropic. Mieux vaut laisser passer 1% de spam que casser le service entier.
 *
 * Coût : ~$0.0005/appel (input ~500 tokens, output ~30 tokens).
 * Latence : 600-900ms typique.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import { ANTHROPIC_API_KEY } from "./config.js";

const SYSTEM_PROMPT = `Tu es un modérateur de contenu pour Nunulia, une marketplace au Burundi, Rwanda et RDC.
Les buyers postent en français, parfois en kirundi, kinyarwanda ou swahili.

Classifie chaque demande en TROIS catégories :

REJECT (refuser systématiquement) :
- Armes, munitions, explosifs, couteaux de combat
- Drogues récréatives (cannabis, cocaïne, héroïne, MDMA, etc.)
- Médicaments sans contexte médical clair (codéine, tramadol seuls)
- Prostitution, services sexuels, escort, "compagnie payante"
- Contrefaçons (faux papiers, fausse monnaie, faux diplômes)
- Arnaques évidentes (multiplication d'argent, "investissement" garanti à 1000%, héritage nigerian, mlm pyramidal)
- Spam (texte aléatoire, "test test", "abc123", caractères répétés, lorem ipsum)
- Contenu haineux ou menaces (ethnique, religieux, politique)
- Sorcellerie / charlatanisme prédateur ("retour d'affection garanti", "marabout puissant 24h")

BORDERLINE (publier MAIS flagger pour review admin) :
- Promesses santé non vérifiées ("perte de poids rapide", "remède miracle")
- Produits naturels à effets exagérés
- Services financiers informels (prêts entre particuliers, "argent rapide")
- Demandes ambiguës qui pourraient être légales ou non selon le contexte
- Animaux de compagnie exotiques (singes, perroquets sauvages)

LEGIT (publier normalement, même si surprenant) :
- Médicaments avec ordonnance OU pharmacie explicite
- Tradipraticiens traditionnels (légaux dans les 3 pays)
- Pièces auto/moto d'occasion
- Services artisanaux (réparation, plomberie, couture)
- Immobilier, emploi, événements
- Produits du quotidien (alimentation, vêtements, électronique)
- Bétail, agriculture, semences
- Cours particuliers, formations

Règles :
1. Réponds UNIQUEMENT en JSON strict : {"verdict": "legit"|"borderline"|"reject", "reason": "<10 mots max>"}
2. En cas de doute entre legit et borderline → borderline
3. En cas de doute entre borderline et reject → borderline (l'admin tranche)
4. Le "reason" est court, en français, descriptif (pas accusateur). Ex: "drogue récréative", "promesse santé non vérifiée", "spam aléatoire"`;

const VALID_VERDICTS = new Set(["legit", "borderline", "reject"]);

export interface ModerationResult {
  verdict: "legit" | "borderline" | "reject";
  reason: string;
}

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedClient;
}

/**
 * Modère une demande buyer via Claude Haiku 4.5.
 *
 * @returns ModerationResult. Si Anthropic échoue → verdict "legit" (fail-open).
 */
export async function moderateBuyerRequest(input: {
  title: string;
  description?: string | null;
  category?: string | null;
}): Promise<ModerationResult> {
  const title = (input.title || "").trim();
  if (!title) return { verdict: "legit", reason: "titre vide (rate limit attrape)" };

  const description = (input.description || "").trim();
  const category = (input.category || "").trim();

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 60,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Titre: "${title}"
Description: "${description || "(aucune)"}"
Catégorie: ${category || "(non précisée)"}

Réponds UNIQUEMENT avec le JSON, sans markdown, sans prose.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("[moderate] pas de bloc texte → fail-open legit");
      return { verdict: "legit", reason: "moderation skipped (no text)" };
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      logger.warn("[moderate] pas de JSON → fail-open legit", { text: textBlock.text.slice(0, 200) });
      return { verdict: "legit", reason: "moderation skipped (no json)" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as Partial<ModerationResult>;

    if (!parsed.verdict || !VALID_VERDICTS.has(parsed.verdict)) {
      logger.warn("[moderate] verdict invalide → fail-open legit", { parsed });
      return { verdict: "legit", reason: "moderation skipped (invalid verdict)" };
    }

    const reason = (parsed.reason || "").trim().slice(0, 80) || "(no reason)";

    logger.info("[moderate] done", {
      title: title.slice(0, 80),
      category,
      verdict: parsed.verdict,
      reason,
      input_tokens: response.usage.input_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens,
      cache_creation_tokens: response.usage.cache_creation_input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    return { verdict: parsed.verdict, reason };
  } catch (err) {
    // FAIL-OPEN : on laisse passer plutôt que de casser le service.
    // Les logs Cloud Functions traceront les pannes Anthropic.
    logger.warn("[moderate] Anthropic erreur → fail-open legit", {
      title: title.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    });
    return { verdict: "legit", reason: "moderation API error" };
  }
}

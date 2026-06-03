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

const SYSTEM_PROMPT = `Tu es un modérateur de contenu pour Nunulia, une marketplace au Burundi, Rwanda, RDC et Tanzanie.
Les buyers postent en français, parfois en kirundi, kinyarwanda ou swahili.

PRINCIPE GÉNÉRAL : sois PERMISSIF. Ne rejette QUE le manifestement illégal ou dangereusement frauduleux.
Tout ce qui est légalement vendable (même si douteux) va en BORDERLINE, l'admin humain tranche.
Ne joue PAS le rôle de protecteur de la santé publique ou de juge moral.

REJECT (refuser systématiquement — UNIQUEMENT ces cas) :
- Armes à feu, munitions, explosifs (PAS les couteaux de cuisine ni les outils)
- Drogues illégales nommées (cocaïne, héroïne, MDMA, cannabis hors cadre médical)
- Médicaments narcotiques prescrits sans contexte médical (tramadol seul, codéine seule)
- Prostitution explicite, "escort", "compagnie payante avec sexe"
- Contrefaçon de documents officiels (faux papiers, fausse monnaie, faux diplômes)
- Spam évident (texte aléatoire "test test", "abc123", lorem ipsum, caractères répétés)
- Menaces ou contenu haineux explicite (ethnique, religieux)

BORDERLINE (publier MAIS flagger pour review admin) :
- Compléments alimentaires / pilules / produits amaigrissants (même avec promesses fortes type "perdre 20kg en 1 semaine")
- Produits cosmétiques à effets exagérés (anti-vieillissement miracle, blanchiment peau)
- Remèdes traditionnels avec promesses ("retour de l'être aimé", "marabout", potions)
- Services financiers informels (prêts entre particuliers, change non-officiel)
- Investissements à rendement élevé ("doublez votre argent", crypto miracle)
- MLM, vente pyramidale
- Animaux de compagnie exotiques
- Tout ce qui te laisse un doute sérieux

LEGIT (publier normalement, même si surprenant) :
- Médicaments avec ordonnance, antibiotiques, paracétamol, etc.
- Tradipraticiens traditionnels (légaux dans les 3 pays)
- Pièces auto/moto d'occasion, voitures
- Services artisanaux (réparation, plomberie, couture, coiffure)
- Immobilier (location, vente, terrain)
- Emploi (offre ou demande), freelance
- Événements (mariage, traiteur, DJ, salle de fête)
- Produits du quotidien (alimentation, vêtements, électronique, mobilier)
- Bétail, agriculture, semences, engrais
- Cours particuliers, formations
- Couteaux de cuisine, machettes agricoles, outils
- Cigarettes, alcool (légaux dans les 3 pays)

Règles ABSOLUES :
1. Réponds UNIQUEMENT en JSON strict : {"verdict": "legit"|"borderline"|"reject", "reason": "<10 mots max>"}
2. En cas de doute entre legit et borderline → borderline
3. En cas de doute entre borderline et reject → BORDERLINE (l'admin tranche, jamais toi)
4. Une promesse exagérée n'est PAS une arnaque — c'est du marketing. → borderline pas reject
5. Un produit risqué pour la santé n'est PAS illégal — c'est le choix de l'acheteur. → borderline pas reject
6. Le "reason" est court, en français, factuel (pas accusateur). Ex: "promesse amaigrissement exagérée", "drogue illégale nommée", "spam aléatoire"`;

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

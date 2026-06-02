/**
 * NUNULIA — Photo Studio vision helper (Claude Haiku 4.5)
 *
 * Appelé par photoSessionAttach AVANT de notifier le vendeur. Envoie les
 * 1-2 premières photos traitées à Haiku Vision avec un prompt qui retourne
 * un JSON {title, category, condition, characteristics[]}.
 *
 * Pré-remplissage du formulaire vendeur sur /studio/:id :
 *   - Joséphine ouvre le lien → titre, catégorie, état déjà remplis
 *   - Elle a 1 seul champ à toucher (prix) au lieu de 4
 *   - Friction réduite drastiquement, surtout pour vendeur faiblement alphabétisé
 *
 * Fail-open : si Haiku échoue (timeout, JSON invalide, modèle indispo), on
 * retourne `null` et la session est livrée sans suggestions. Le vendeur
 * remplit alors les 4 champs comme avant — pas de blocage.
 *
 * Coût : ~$0.005/session (2 images ~3000 tokens input + ~400 tokens output).
 * Latence : 1.5-3s typique avec vision.
 *
 * Sécurité : pas d'écriture Firestore depuis ce module (lecture-only +
 * appel API). C'est l'appelant qui décide du persistance.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import { ANTHROPIC_API_KEY } from "./config.js";

export interface VisionSuggestions {
  title?: string;
  category?: string;                          // category slug (FK Firestore)
  condition?: "new" | "good" | "fair";
  characteristics?: string[];
}

const VALID_CONDITIONS = new Set(["new", "good", "fair"]);

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedClient;
}

/**
 * Prompt système optimisé pour vision produit Nunulia.
 * Cache_control ephemeral pour bénéficier du discount Anthropic sur les
 * appels répétés (le prompt système ne change pas, seules les images varient).
 */
const SYSTEM_PROMPT = `Tu reçois les photos d'un produit qu'un vendeur va publier sur Nunulia,
marketplace au Burundi/RDC/Rwanda. Tu remplis un mini-formulaire à sa place.

Réponds UNIQUEMENT en JSON strict (pas de markdown, pas de prose) :
{
  "title": "4-6 mots maximum, sans marque inventée, sans prix",
  "category": "un des slugs valides (voir liste)",
  "condition": "new | good | fair",
  "characteristics": ["3 à 5 puces visibles (couleur, matière, taille apparente, accessoires)"]
}

Slugs catégorie autorisés (utilise EXACTEMENT un de ceux-ci) :
electronique-telephonie | mode-accessoires | beaute-sante | restaurant |
supermarche-alimentaire | maison-cuisine | bebe-enfants | sport-loisirs |
education-fournitures | construction-btp | auto-moto | energie-solaire |
agriculture-elevage | services

Règles strictes :
- Si le produit est inconnu/ambigu, mets "title" générique honnête (ex: "Téléphone d'occasion")
  et "characteristics": []
- "condition": "new" si emballage/étiquette visible OU surface parfaite, "good" si trace
  d'usage normale, "fair" si défauts visibles
- "title" : pas de prix, pas de "à vendre", pas de "neuf à vendre" (redondant)
- Ne JAMAIS inventer une marque ou un modèle que tu ne vois pas — rester factuel
- Catégorie : choisis le slug le plus proche, jamais en dehors de la liste`;

interface RawResponse {
  title?: unknown;
  category?: unknown;
  condition?: unknown;
  characteristics?: unknown;
}

/**
 * Demande à Haiku Vision d'analyser jusqu'à 2 photos et retourne un objet
 * de suggestions. Fail-open : retourne null en cas d'erreur (le vendeur
 * verra un formulaire vide, ce qui est le comportement par défaut).
 *
 * @param imageUrls — URLs Cloudinary publiques des photos traitées
 */
export async function analyzeProductPhotos(
  imageUrls: string[],
): Promise<VisionSuggestions | null> {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) return null;

  // On envoie max 2 images (suffisant — 1 vue principale + 1 secondaire).
  // Au-delà, le ratio coût/qualité d'analyse décroche.
  const urls = imageUrls.slice(0, 2).filter((u) => typeof u === "string" && u.startsWith("https://"));
  if (urls.length === 0) return null;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 400,
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
          content: [
            ...urls.map((url) => ({
              type: "image" as const,
              source: { type: "url" as const, url },
            })),
            {
              type: "text" as const,
              text: "Analyse ces photos et remplis le JSON.",
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("[vision] no text block — skipping");
      return null;
    }

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn("[vision] no JSON in response", { text: textBlock.text.slice(0, 200) });
      return null;
    }

    let parsed: RawResponse;
    try {
      parsed = JSON.parse(jsonMatch[0]) as RawResponse;
    } catch (parseErr) {
      logger.warn("[vision] JSON parse failed", { err: parseErr, text: jsonMatch[0].slice(0, 200) });
      return null;
    }

    // Nettoyage strict — on n'expose au front que des champs valides
    const result: VisionSuggestions = {};

    if (typeof parsed.title === "string") {
      const t = parsed.title.trim().slice(0, 100);
      if (t.length >= 3) result.title = t;
    }
    if (typeof parsed.category === "string") {
      const c = parsed.category.trim();
      if (c.length > 0 && c.length <= 60) result.category = c;
    }
    if (typeof parsed.condition === "string") {
      const cond = parsed.condition.trim().toLowerCase();
      if (VALID_CONDITIONS.has(cond)) {
        result.condition = cond as "new" | "good" | "fair";
      }
    }
    if (Array.isArray(parsed.characteristics)) {
      const chars = parsed.characteristics
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().slice(0, 80))
        .slice(0, 5);
      if (chars.length > 0) result.characteristics = chars;
    }

    logger.info("[vision] done", {
      hasTitle: !!result.title,
      hasCategory: !!result.category,
      condition: result.condition,
      charsCount: result.characteristics?.length ?? 0,
      input_tokens: response.usage.input_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    // Si rien d'utile n'a été extrait, retourne null (évite de polluer la session)
    if (!result.title && !result.category && !result.condition && !result.characteristics) {
      return null;
    }
    return result;
  } catch (err) {
    // FAIL-OPEN : Haiku down, JSON cassé, image inaccessible — on n'empêche
    // PAS la livraison de la session au vendeur. La présence ou absence de
    // suggestions est indépendante du flow principal.
    logger.warn("[vision] Anthropic error — fail-open", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * NUNULIA — AI Category Classifier (Claude Haiku 4.5)
 *
 * Appelé par notify-buyer-request-match quand l'acheteur choisit
 * "Je ne sais pas trop" (slug `_help`). Haiku regarde le titre +
 * le pays et renvoie {slug, confidence}.
 *
 * - confidence ≥ 0.7 → on traite comme une vraie catégorie
 * - confidence < 0.7 → on tombe sur le fallback top 20 Pro
 *
 * Coût estimé : ~$0.0001 par appel (cf. notes économiques).
 * En cas d'erreur Anthropic (timeout, API down) → renvoie null,
 * et la CF appelante fait le fallback Pro automatiquement.
 */

import Anthropic from "@anthropic-ai/sdk";
import * as logger from "firebase-functions/logger";
import { ANTHROPIC_API_KEY } from "./config.js";

// ── Catalogue des 14 catégories (calibre Haiku, multilingue FR/Kirundi/Kinyarwanda/Swahili) ──
const SYSTEM_PROMPT = `Tu es un classifieur de demandes d'achats sur Nunulia (marketplace Burundi/RDC/Rwanda).
Les buyers tapent en français, parfois en kirundi, kinyarwanda ou swahili.

Catégories disponibles :
- electronique-telephonie : Téléphones (iPhone, Samsung, Tecno, Itel, Infinix), tablettes, ordinateurs, TV, chargeurs, écouteurs, simu, mudasobwa
- mode-accessoires : Vêtements (robe, chemise, jean, pagne), chaussures, sacs, montres, bijoux, lunettes, impuzu, nguo, viatu
- beaute-sante : Parfums, cosmétiques, perruques, savons, médicaments, soins, isabune, amavuta, sabuni, mafuta, dawa
- restaurant : Traiteurs, restauration, livraison repas, gâteaux, pizza, brochettes, ibiryo, chakula
- supermarche-alimentaire : Épicerie, riz, haricot, farine, sucre, huile, fruits, légumes, boissons, umuceri, mchele, sukari
- maison-cuisine : Meubles (canapé, lit, table), décoration, cuisine (casserole, frigo, assiettes), intebe, kiti, meza
- bebe-enfants : Vêtements bébé, biberons, couches, jouets, articles enfants, umwana, mtoto
- sport-loisirs : Sport (football, basket, vélo), fitness, instruments musique, livres loisir, umupira, mpira
- education-fournitures : Cahiers, stylos, manuels, formations, cours, écoles, igitabo, kitabu, shule
- construction-btp : Ciment, briques, tôle, peinture, plomberie, électricité bâtiment, saruji, mawe
- auto-moto : Voitures (Toyota, Noah, RAV4), motos, pneus, pièces auto/moto, imodoka, pikipiki, gari
- energie-solaire : Panneaux solaires, batteries solaires, lampes solaires, générateurs, sola, jua
- agriculture-elevage : Semences, engrais, vaches, chèvres, volaille, outils agricoles, inka, ng'ombe, mbegu
- services : Réparation, installation, ménage, coiffure, photographie, transport, formation pro, usafi, kurekebisha

Règles :
1. Réponds UNIQUEMENT en JSON strict : {"slug": "category-slug", "confidence": 0.0-1.0}
2. confidence ≥ 0.7 = certain du match
3. confidence 0.5-0.7 = probable mais ambigu
4. confidence < 0.5 = très incertain
5. Si rien ne colle vraiment, choisis le slug le plus proche avec confidence basse (< 0.5)`;

const VALID_SLUGS = new Set([
  "electronique-telephonie",
  "mode-accessoires",
  "beaute-sante",
  "restaurant",
  "supermarche-alimentaire",
  "maison-cuisine",
  "bebe-enfants",
  "sport-loisirs",
  "education-fournitures",
  "construction-btp",
  "auto-moto",
  "energie-solaire",
  "agriculture-elevage",
  "services",
]);

export interface ClassificationResult {
  slug: string;
  confidence: number;
}

// Cached entre invocations (Firebase Functions Gen 2 réutilise les instances)
let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedClient;
}

/**
 * Classifie un titre de demande dans une des 14 catégories Nunulia.
 *
 * @returns {slug, confidence} ou null si l'API échoue → caller fait fallback Pro.
 *
 * Note caching : le system prompt fait ~800 tokens, en dessous du minimum
 * cacheable Haiku 4.5 (4096). Le marker cache_control est conservé pour
 * activation automatique si on enrichit le prompt plus tard, mais en V1
 * il ne réduit pas le coût. Coût brut acceptable (~$0.0006/appel).
 */
export async function classifyWithAI(
  title: string,
  countryId: string,
): Promise<ClassificationResult | null> {
  const trimmed = (title || "").trim();
  if (!trimmed) return null;

  try {
    const client = getClient();
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 100,
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
          content: `Titre de la demande: "${trimmed}"\nPays: ${countryId}\n\nRéponds UNIQUEMENT avec le JSON, sans markdown, sans prose.`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      logger.warn("[ai-classify] pas de bloc texte dans la réponse");
      return null;
    }

    // Parse JSON robuste — Haiku peut parfois entourer de ```json ... ```
    // ou ajouter un mot avant. On extrait le 1er objet JSON valide trouvé.
    const jsonMatch = textBlock.text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      logger.warn("[ai-classify] pas de JSON dans la réponse", { text: textBlock.text });
      return null;
    }
    const parsed = JSON.parse(jsonMatch[0]) as ClassificationResult;

    if (!parsed.slug || typeof parsed.confidence !== "number") {
      logger.warn("[ai-classify] JSON mal formé", { parsed });
      return null;
    }

    // Sécurité : si Haiku invente un slug, on rejette plutôt que de propager.
    if (!VALID_SLUGS.has(parsed.slug)) {
      logger.warn("[ai-classify] slug inconnu rejeté", { slug: parsed.slug });
      return null;
    }
    // Clamp confidence dans [0,1]
    parsed.confidence = Math.max(0, Math.min(1, parsed.confidence));

    logger.info("[ai-classify] success", {
      title: trimmed.slice(0, 80),
      countryId,
      slug: parsed.slug,
      confidence: parsed.confidence,
      input_tokens: response.usage.input_tokens,
      cache_read_tokens: response.usage.cache_read_input_tokens,
      cache_creation_tokens: response.usage.cache_creation_input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    return parsed;
  } catch (err) {
    logger.warn("[ai-classify] erreur → fallback Pro", {
      title: trimmed.slice(0, 80),
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

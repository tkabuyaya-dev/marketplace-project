/**
 * NUNULIA — Translate B2B Post (Cloud Function, Claude Haiku 4.5)
 *
 * Trigger : onCreate b2b_posts/{postId}
 *
 * Rôle :
 *   1. Lit originalText + originalLang du post fraîchement créé.
 *   2. Vérifie le cache b2bTranslationCache/{hash}. Si hit → écrit translations
 *      depuis le cache, status='done', terminé.
 *   3. Sinon : appelle Claude Haiku 4.5 pour traduire vers les 4 autres langues
 *      cibles, JSON contraint. Écrit translations + status='done' + cache.
 *   4. En cas d'erreur : status='failed', le post reste visible dans la langue
 *      source côté front (fallback transparent).
 *
 * Coût steady-state :
 *   ~$0.0006 par appel Haiku 4.5. Avec cache hash 50%+ hit → ~$0.30/mois
 *   pour 200 posts/mois. Trivial.
 */

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import * as crypto from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "./admin.js";
import { ANTHROPIC_API_KEY } from "./config.js";

type B2BLang = "fr" | "en" | "sw" | "rn" | "rw";
const ALL_LANGS: B2BLang[] = ["fr", "en", "sw", "rn", "rw"];

const SYSTEM_PROMPT = `Tu es traducteur expert pour le commerce en Afrique centrale.
Règles absolues :
1. Garde les noms de villes INTACTS.
2. Garde les noms de produits commerciaux intacts (ex: "iPhone 15", "riz Pakistan", "ciment Dangote").
3. Adapte le registre commercial naturel de chaque langue cible.
4. En Swahili (sw) : registre commercial tanzanien/congolais.
5. En Kirundi (rn) et Kinyarwanda (rw) : reste sobre et professionnel.
6. Retourne UNIQUEMENT un JSON valide de la forme : {"fr":"...","en":"...","sw":"...","rn":"...","rw":"..."}
7. Ne traduis PAS la langue source ; renvoie une chaîne vide pour cette clé.
8. Pas de markdown, pas de commentaires, juste le JSON.`;

let cachedClient: Anthropic | null = null;
function getClient(): Anthropic {
  if (cachedClient) return cachedClient;
  cachedClient = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
  return cachedClient;
}

function hashKey(text: string, sourceLang: B2BLang): string {
  const normalized = text.toLowerCase().normalize("NFD").replace(/\s+/g, " ").trim();
  const raw = `${sourceLang}__${normalized}`;
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 40);
}

export const translateB2BPost = onDocumentCreated(
  {
    document: "b2b_posts/{postId}",
    region: "europe-west1",
    secrets: [ANTHROPIC_API_KEY],
    timeoutSeconds: 60,
    maxInstances: 10,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const postId = event.params.postId;
    const data = snap.data() as {
      originalText?: string;
      originalLang?: B2BLang;
      translationStatus?: string;
    };
    const originalText = (data.originalText || "").trim();
    const sourceLang = (data.originalLang || "fr") as B2BLang;

    if (!originalText) {
      logger.warn("[b2b-translate] empty originalText, skip", { postId });
      return;
    }

    const db = await getDb();
    const postRef = db.collection("b2b_posts").doc(postId);
    const cacheRef = db.collection("b2bTranslationCache").doc(hashKey(originalText, sourceLang));

    // ── Cache hit ────────────────────────────────────────────────────────
    try {
      const cacheSnap = await cacheRef.get();
      if (cacheSnap.exists) {
        const cached = cacheSnap.data() as { translations?: Record<string, string> };
        if (cached.translations) {
          await postRef.update({
            translations: cached.translations,
            translationStatus: "done",
            translatedAt: Date.now(),
            updatedAt: Date.now(),
          });
          await cacheRef.update({
            hitCount: FieldValue.increment(1),
            lastHitAt: FieldValue.serverTimestamp(),
          });
          logger.info("[b2b-translate] cache HIT", { postId });
          return;
        }
      }
    } catch (err) {
      logger.warn("[b2b-translate] cache read failed", { postId, err: (err as Error).message });
    }

    // ── Appel Claude Haiku 4.5 ───────────────────────────────────────────
    const targetLangs = ALL_LANGS.filter((l) => l !== sourceLang);
    const userPrompt = `Texte source (langue ${sourceLang}) :\n"""${originalText}"""\n\n` +
      `Traduis dans les langues suivantes : ${targetLangs.join(", ")}.\n` +
      `Réponds avec UN JSON contenant les 5 clés (fr, en, sw, rn, rw). Mets "" pour la langue source.`;

    try {
      const client = getClient();
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 600,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
      const block = response.content.find((b) => b.type === "text");
      if (!block || block.type !== "text") throw new Error("no text block");
      const match = block.text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("no JSON in response");
      const parsed = JSON.parse(match[0]) as Partial<Record<B2BLang, string>>;

      // Garde-fous : la traduction de la langue source = texte original
      // (évite que le front affiche "" si l'utilisateur lit la langue source).
      const translations: Record<B2BLang, string> = {
        fr: "", en: "", sw: "", rn: "", rw: "",
      };
      for (const l of ALL_LANGS) {
        const v = parsed[l];
        translations[l] = typeof v === "string" ? v.trim() : "";
      }
      translations[sourceLang] = originalText;

      await postRef.update({
        translations,
        translationStatus: "done",
        translatedAt: Date.now(),
        updatedAt: Date.now(),
      });

      // Écriture cache (24h TTL implicite — on overwrite à chaque hit, c'est OK)
      await cacheRef.set({
        translations,
        sourceLang,
        createdAt: FieldValue.serverTimestamp(),
        hitCount: 0,
        sampleText: originalText.slice(0, 80),
      });

      logger.info("[b2b-translate] success", {
        postId,
        sourceLang,
        targets: targetLangs,
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      });
    } catch (err) {
      logger.error("[b2b-translate] Anthropic error", {
        postId,
        err: err instanceof Error ? err.message : String(err),
      });
      try {
        await postRef.update({
          translationStatus: "failed",
          updatedAt: Date.now(),
        });
      } catch { /* best-effort */ }
    }
  },
);

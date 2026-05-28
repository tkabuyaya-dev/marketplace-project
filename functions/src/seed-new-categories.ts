/**
 * NUNULIA — Seed 3 new categories (one-shot HTTP function).
 *
 * Ajoute Immobilier, Emploi & Recrutement, Événements & Cérémonies à la
 * collection /categories. Les `order` sont fractionnaires pour insérer
 * dans la grid sans toucher aux autres docs (Firestore tri par order).
 *
 * Idempotent : si un slug existe déjà, on skip.
 *
 * Sécurité : Bearer NUNULIA_SECRET_TOKEN, POST only.
 *
 * Usage :
 *   curl -X POST -H "Authorization: Bearer $NUNULIA_SECRET_TOKEN" \
 *        https://europe-west1-aurburundi-e2fe2.cloudfunctions.net/seedNewCategories
 *
 * À exécuter une seule fois après le déploiement.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const NEW_CATEGORIES = [
  {
    id: "immobilier",
    slug: "immobilier",
    name: "Immobilier",
    icon: "🏡",
    order: 6.5, // entre Maison & Décoration (6) et Bébé & Enfants (7)
  },
  {
    id: "emploi-recrutement",
    slug: "emploi-recrutement",
    name: "Emploi & Recrutement",
    icon: "💼",
    order: 13.5, // entre Agriculture & Élevage (13) et Services (14)
  },
  {
    id: "evenements-ceremonies",
    slug: "evenements-ceremonies",
    name: "Événements & Cérémonies",
    icon: "🎉",
    order: 4.5, // entre Restauration & Traiteur (4) et Supermarché (5)
  },
];

export const seedNewCategories = onRequest(
  {
    region:         "europe-west1",
    secrets:        [NUNULIA_SECRET_TOKEN],
    maxInstances:   1,
    timeoutSeconds: 60,
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      logger.warn("[seedNewCategories] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "POST required" });
      return;
    }

    const db = await getDb();
    const results: Array<{ slug: string; status: "created" | "skipped" }> = [];

    for (const cat of NEW_CATEGORIES) {
      const ref = db.collection("categories").doc(cat.id);
      const existing = await ref.get();
      if (existing.exists) {
        results.push({ slug: cat.slug, status: "skipped" });
        continue;
      }
      await ref.set({
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        order: cat.order,
      });
      results.push({ slug: cat.slug, status: "created" });
    }

    logger.info("[seedNewCategories] done", { results });
    res.status(200).json({
      success: true,
      results,
    });
  },
);

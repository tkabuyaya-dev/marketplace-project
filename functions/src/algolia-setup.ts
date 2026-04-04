/**
 * NUNULIA — Algolia Index Setup & Full Reindex
 *
 * Admin-only callable function. Uses dynamic import for algoliasearch.
 * Protected by Firebase Auth token verification + admin role check.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb, ensureInitialized } from "./admin.js";
import {
  ALGOLIA_APP_ID,
  ALGOLIA_ADMIN_KEY,
  ALGOLIA_PRODUCTS_INDEX,
  ALGOLIA_SELLERS_INDEX,
} from "./config.js";
import { ALLOWED_ORIGINS } from "./config.js";

export const setupAlgoliaIndexes = onRequest(
  {
    region: "europe-west1",
    secrets: [ALGOLIA_APP_ID, ALGOLIA_ADMIN_KEY],
    maxInstances: 1,
    timeoutSeconds: 540,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    // ── Admin authentication check ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Missing or invalid Authorization header" });
      return;
    }

    try {
      await ensureInitialized();
      const { getAuth } = await import("firebase-admin/auth");
      const token = authHeader.split("Bearer ")[1];
      const decoded = await getAuth().verifyIdToken(token);

      // Verify admin role from Firestore (not from client claims)
      const db = await getDb();
      const userDoc = await db.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists || userDoc.data()?.role !== "admin") {
        logger.warn(`[Algolia Setup] Unauthorized attempt by uid=${decoded.uid}`);
        res.status(403).json({ error: "Admin access required" });
        return;
      }
    } catch (authErr: any) {
      logger.error("[Algolia Setup] Auth verification failed:", authErr.message);
      res.status(401).json({ error: "Invalid authentication token" });
      return;
    }

    // ── Only POST allowed for state-changing operation ──
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed. Use POST." });
      return;
    }

    const { algoliasearch } = await import("algoliasearch");

    try {
      const client = algoliasearch(
        ALGOLIA_APP_ID.value(),
        ALGOLIA_ADMIN_KEY.value()
      );

      // Configure Products index settings
      await client.setSettings({
        indexName: ALGOLIA_PRODUCTS_INDEX,
        indexSettings: {
          searchableAttributes: [
            "title",
            "titleLower",
            "tags",
            "category",
            "subCategory",
            "description",
            "sellerName",
          ],
          attributesForFaceting: [
            "filterOnly(status)",
            "searchable(category)",
            "searchable(subCategory)",
            "searchable(marketplace)",
            "filterOnly(sellerId)",
            "searchable(tags)",
            "searchable(countryId)",
            "searchable(country)",
            "searchable(sellerProvince)",
            "searchable(sellerCommune)",
            "filterOnly(isNew)",
            "filterOnly(isSponsored)",
          ],
          customRanking: [
            "desc(isSponsored)",
            "desc(sales)",
            "desc(rating)",
            "desc(views)",
            "desc(likesCount)",
            "desc(createdAt)",
          ],
          attributesToRetrieve: [
            "objectID",
            "title",
            "slug",
            "price",
            "originalPrice",
            "discountPrice",
            "currency",
            "images",
            "category",
            "subCategory",
            "tags",
            "marketplace",
            "sellerId",
            "sellerName",
            "sellerIsVerified",
            "rating",
            "reviews",
            "views",
            "likesCount",
            "sales",
            "stockQuantity",
            "createdAt",
            "countryId",
            "country",
            "countryCode",
            "sellerProvince",
            "sellerCommune",
            "isNew",
            "isSponsored",
          ],
          hitsPerPage: 20,
          maxValuesPerFacet: 50,
          typoTolerance: true,
          minWordSizefor1Typo: 3,
          minWordSizefor2Typos: 7,
          ignorePlurals: ["fr", "en"],
          removeStopWords: ["fr", "en"],
          queryLanguages: ["fr", "en", "sw"],
        },
      });

      // Configure Sellers index settings
      await client.setSettings({
        indexName: ALGOLIA_SELLERS_INDEX,
        indexSettings: {
          searchableAttributes: [
            "name",
            "shopName",
            "bio",
            "categories",
          ],
          attributesForFaceting: [
            "filterOnly(role)",
            "searchable(marketplace)",
          ],
          customRanking: [
            "desc(productCount)",
            "desc(isVerified)",
          ],
          hitsPerPage: 10,
          typoTolerance: true,
          queryLanguages: ["fr", "en"],
        },
      });

      logger.info("[Algolia] Index settings configured successfully");

      // Full reindex of approved products
      const db = await getDb();
      let totalProducts = 0;
      let lastDoc: any = null;
      const batchSize = 200;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        let q = db
          .collection("products")
          .where("status", "==", "approved")
          .orderBy("createdAt", "desc")
          .limit(batchSize);

        if (lastDoc) {
          q = q.startAfter(lastDoc);
        }

        const snap = await q.get();
        if (snap.empty) break;

        const COUNTRY_NAMES: Record<string, string> = {
          bi: "Burundi", cd: "RDC", rw: "Rwanda",
          ug: "Ouganda", tz: "Tanzanie", ke: "Kenya",
        };
        const COUNTRY_CODES: Record<string, string> = {
          bi: "BI", cd: "CD", rw: "RW", ug: "UG", tz: "TZ", ke: "KE",
        };
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

        // Batch-fetch seller details for province/commune
        const sellerIds = [...new Set(snap.docs.map(d => d.data().sellerId).filter(Boolean))];
        const sellerMap: Record<string, any> = {};
        if (sellerIds.length > 0) {
          // Firestore getAll supports up to 100 refs at a time
          for (let i = 0; i < sellerIds.length; i += 100) {
            const batch = sellerIds.slice(i, i + 100).map(id => db.collection("users").doc(id));
            const sellerDocs = await db.getAll(...batch);
            for (const sd of sellerDocs) {
              if (sd.exists) sellerMap[sd.id] = sd.data()?.sellerDetails;
            }
          }
        }

        const records = snap.docs.map((d) => {
          const data = d.data();
          const createdAt = data.createdAt?.toMillis?.() || Date.now();
          const countryId = data.countryId || "";
          const sd = sellerMap[data.sellerId] || {};
          return {
            objectID: d.id,
            title: data.title || "",
            titleLower: data.titleLower || "",
            description: (data.description || "").substring(0, 500),
            price: data.price || 0,
            originalPrice: data.originalPrice || null,
            discountPrice: data.discountPrice || null,
            currency: data.currency || "",
            category: data.category || "",
            subCategory: data.subCategory || "",
            tags: data.tags || [],
            marketplace: data.marketplace || null,
            sellerId: data.sellerId || "",
            sellerName: data.sellerName || "",
            sellerIsVerified: data.sellerIsVerified || false,
            images: (data.images || []).slice(0, 3),
            rating: data.rating || 0,
            reviews: data.reviews || 0,
            views: data.views || 0,
            likesCount: data.likesCount || 0,
            stockQuantity: data.stockQuantity ?? null,
            slug: data.slug || "",
            status: data.status,
            createdAt,
            countryId,
            country: COUNTRY_NAMES[countryId] || "",
            countryCode: COUNTRY_CODES[countryId] || "",
            sellerProvince: sd.province || "",
            sellerCommune: sd.commune || "",
            isNew: createdAt > thirtyDaysAgo,
            isSponsored: data.isSponsored || false,
            sales: data.sales || 0,
          };
        });

        await client.saveObjects({
          indexName: ALGOLIA_PRODUCTS_INDEX,
          objects: records,
        });

        totalProducts += records.length;
        lastDoc = snap.docs[snap.docs.length - 1];

        if (snap.docs.length < batchSize) break;
      }

      // Full reindex of sellers
      let totalSellers = 0;
      const sellersSnap = await db
        .collection("users")
        .where("role", "==", "seller")
        .get();

      if (!sellersSnap.empty) {
        const sellerRecords = sellersSnap.docs.map((d) => {
          const data = d.data();
          return {
            objectID: d.id,
            name: data.name || "",
            nameLower: data.nameLower || "",
            avatar: data.avatar || "",
            slug: data.slug || "",
            isVerified: data.isVerified || false,
            role: data.role,
            shopName: data.sellerDetails?.shopName || data.name || "",
            marketplace: data.sellerDetails?.marketplace || null,
            categories: data.sellerDetails?.categories || [],
            productCount: data.productCount || 0,
            bio: data.bio || "",
          };
        });

        await client.saveObjects({
          indexName: ALGOLIA_SELLERS_INDEX,
          objects: sellerRecords,
        });

        totalSellers = sellerRecords.length;
      }

      const msg = `Algolia setup complete: ${totalProducts} products, ${totalSellers} sellers indexed`;
      logger.info(`[Algolia] ${msg}`);
      res.json({ success: true, message: msg });
    } catch (err: any) {
      logger.error("[Algolia Setup]", err);
      res.status(500).json({ error: err.message });
    }
  }
);

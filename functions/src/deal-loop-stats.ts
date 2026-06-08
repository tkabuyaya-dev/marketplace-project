/**
 * NUNULIA — Deal Loop Analytics (callable, admin-only)
 *
 * Agrège la collection `contactEvents` (CF-only, donc l'admin ne peut pas la
 * lire côté client) en un tableau de bord d'intelligence commerciale :
 *   - Funnel réel : Contacts → Répondu → Vendu (+ taux de conversion)
 *   - GMV estimé par devise (somme des prix des ventes confirmées)
 *   - 🚩 Vendeurs à surveiller : beaucoup de contacts MÛRS (>48h, déjà
 *     sollicités) mais 0 vente confirmée → injoignable / arnaque / prix hors-marché
 *   - ⭐ Champions : meilleurs vendeurs par ventes confirmées
 *   - 📈 Demande non convertie : produits très contactés sans vente
 *   - Série 14 jours (sparkline)
 *
 * Sécurité : admin only via claim JWT `role === 'admin'` (cf. confirm-buyer-request).
 * Lecture seule. Plafonnée à RECENT_DAYS jours et MAX_EVENTS docs.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { ALLOWED_ORIGINS } from "./config.js";

const COLLECTION = "contactEvents";
const RECENT_DAYS = 90;
const MAX_EVENTS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
const UTC2_OFFSET_MS = 2 * 60 * 60 * 1000; // jour local Burundi/Rwanda
/** Contacts "mûrs" = passés le délai de 48h (sollicités ou déjà tranchés). */
const MATURE = new Set(["prompted", "confirmed_yes", "confirmed_no"]);
/** Seuil de contacts mûrs pour signaler un vendeur sans aucune vente. */
const WATCH_MIN_MATURED = 3;
const TOP_N = 8;

interface SellerAgg {
  sellerUid: string;
  contacts: number;
  matured: number;
  sold: number;
  notSold: number;
}
interface ProductAgg {
  productId: string;
  slug: string | null;
  title: string;
  contacts: number;
  sold: number;
}

function localDayKey(ms: number): string {
  return new Date(ms + UTC2_OFFSET_MS).toISOString().slice(0, 10);
}

export const getDealLoopStats = onCall(
  { region: "europe-west1", cors: ALLOWED_ORIGINS, maxInstances: 5, timeoutSeconds: 60 },
  async (request) => {
    // ── Admin gate (claim JWT) ───────────────────────────────────────────
    if (request.auth?.token?.role !== "admin") {
      throw new HttpsError("permission-denied", "Admin uniquement.");
    }

    const db = await getDb();
    const now = Date.now();
    const since = now - RECENT_DAYS * DAY_MS;

    const snap = await db
      .collection(COLLECTION)
      .where("createdAt", ">=", since)
      .orderBy("createdAt", "desc")
      .limit(MAX_EVENTS)
      .get();

    // ── Accumulateurs ────────────────────────────────────────────────────
    const status = { pending: 0, prompted: 0, confirmed_yes: 0, confirmed_no: 0 };
    let clicks = 0;
    const gmvByCurrency: Record<string, number> = {};
    const sellers = new Map<string, SellerAgg>();
    const products = new Map<string, ProductAgg>();
    const dayContacts = new Map<string, number>();

    for (const doc of snap.docs) {
      const d = doc.data() as {
        sellerUid?: string;
        productId?: string;
        productSlug?: string | null;
        productTitle?: string;
        productPrice?: number | null;
        currency?: string | null;
        status?: string;
        createdAt?: number;
        contactCount?: number;
      };
      const st = (d.status || "pending") as keyof typeof status;
      if (st in status) status[st]++;
      clicks += typeof d.contactCount === "number" ? d.contactCount : 1;

      // GMV : uniquement les ventes confirmées avec prix+devise.
      if (st === "confirmed_yes" && typeof d.productPrice === "number" && d.currency) {
        gmvByCurrency[d.currency] = (gmvByCurrency[d.currency] || 0) + d.productPrice;
      }

      // Agrégat vendeur
      if (d.sellerUid) {
        let s = sellers.get(d.sellerUid);
        if (!s) {
          s = { sellerUid: d.sellerUid, contacts: 0, matured: 0, sold: 0, notSold: 0 };
          sellers.set(d.sellerUid, s);
        }
        s.contacts++;
        if (MATURE.has(st)) s.matured++;
        if (st === "confirmed_yes") s.sold++;
        if (st === "confirmed_no") s.notSold++;
      }

      // Agrégat produit
      if (d.productId) {
        let p = products.get(d.productId);
        if (!p) {
          p = {
            productId: d.productId,
            slug: d.productSlug || null,
            title: d.productTitle || "Produit",
            contacts: 0,
            sold: 0,
          };
          products.set(d.productId, p);
        }
        p.contacts++;
        if (st === "confirmed_yes") p.sold++;
      }

      // Série journalière (14 derniers jours)
      if (typeof d.createdAt === "number" && d.createdAt >= now - 14 * DAY_MS) {
        const k = localDayKey(d.createdAt);
        dayContacts.set(k, (dayContacts.get(k) || 0) + 1);
      }
    }

    const distinctContacts = snap.size;
    const sold = status.confirmed_yes;
    const notSold = status.confirmed_no;
    const responded = sold + notSold;
    const maturedTotal = responded + status.prompted;
    const awaiting = status.pending + status.prompted;

    // 🚩 Vendeurs à surveiller : assez de contacts mûrs, ZÉRO vente.
    const watchSellers = [...sellers.values()]
      .filter((s) => s.matured >= WATCH_MIN_MATURED && s.sold === 0)
      .sort((a, b) => b.matured - a.matured)
      .slice(0, TOP_N);

    // ⭐ Champions : par ventes confirmées.
    const champions = [...sellers.values()]
      .filter((s) => s.sold > 0)
      .sort((a, b) => b.sold - a.sold)
      .slice(0, TOP_N);

    // 📈 Demande non convertie : produits très contactés, 0 vente.
    const unmetDemand = [...products.values()]
      .filter((p) => p.contacts >= 2 && p.sold === 0)
      .sort((a, b) => b.contacts - a.contacts)
      .slice(0, TOP_N);

    // 🔝 Classements bruts (tous, par contacts reçus) — la vue "qui/quoi cartonne".
    const topProductsByContacts = [...products.values()]
      .sort((a, b) => b.contacts - a.contacts)
      .slice(0, TOP_N);
    const topSellersByContacts = [...sellers.values()]
      .sort((a, b) => b.contacts - a.contacts)
      .slice(0, TOP_N);

    // Noms des vendeurs apparaissant dans watch + champions (lecture bornée).
    const uidSet = new Set<string>([
      ...watchSellers.map((s) => s.sellerUid),
      ...champions.map((s) => s.sellerUid),
      ...topSellersByContacts.map((s) => s.sellerUid),
    ]);
    const names: Record<string, { name: string; slug: string | null }> = {};
    const uids = [...uidSet];
    for (let i = 0; i < uids.length; i += 30) {
      const batch = uids.slice(i, i + 30);
      if (batch.length === 0) break;
      const refs = batch.map((id) => db.collection("users").doc(id));
      const docs = await db.getAll(...refs);
      docs.forEach((dd) => {
        if (dd.exists) {
          const u = dd.data() as { name?: string; slug?: string; sellerDetails?: { shopName?: string } };
          names[dd.id] = {
            name: u.sellerDetails?.shopName || u.name || "Vendeur",
            slug: typeof u.slug === "string" ? u.slug : null,
          };
        }
      });
    }

    // Série 14 jours, ordonnée chronologiquement (remplit les jours vides).
    const series14d: { day: string; contacts: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const k = localDayKey(now - i * DAY_MS);
      series14d.push({ day: k, contacts: dayContacts.get(k) || 0 });
    }

    const withName = <T extends { sellerUid: string }>(s: T) => ({
      ...s,
      name: names[s.sellerUid]?.name || "Vendeur",
      slug: names[s.sellerUid]?.slug || null,
    });

    logger.info("[getDealLoopStats] OK", {
      events: distinctContacts,
      sold,
      sellers: sellers.size,
      capped: distinctContacts >= MAX_EVENTS,
    });

    return {
      periodDays: RECENT_DAYS,
      capped: distinctContacts >= MAX_EVENTS,
      kpis: {
        contacts: distinctContacts,
        clicks,
        sold,
        notSold,
        responded,
        awaiting,
        conversionResponded: responded > 0 ? sold / responded : 0,
        conversionMatured: maturedTotal > 0 ? sold / maturedTotal : 0,
      },
      gmvByCurrency,
      funnel: [
        { stage: "contacts", count: distinctContacts },
        { stage: "matured", count: maturedTotal },
        { stage: "responded", count: responded },
        { stage: "sold", count: sold },
      ],
      watchSellers: watchSellers.map(withName),
      champions: champions.map(withName),
      topSellersByContacts: topSellersByContacts.map(withName),
      topProductsByContacts,
      unmetDemand,
      series14d,
    };
  },
);

/**
 * NUNULIA — Deal Loop : sweep quotidien
 *
 * Tourne chaque jour à 08:30 (Africa/Bujumbura). Pour chaque contactEvent
 * 'pending' vieux de plus de 48h : crée une notification au VENDEUR
 * (« Avez-vous vendu X ? ») → le push système suit automatiquement via
 * onNotificationCreate (fcm-send.ts). On ne touche PAS aux composants FCM.
 *
 * Pourquoi le vendeur et pas l'acheteur : le vendeur est TOUJOURS identifiable
 * (compte + dashboard pour répondre), là où l'acheteur peut être anonyme. Sa
 * réponse alimente sellerStats.confirmedSales (vente déclarée) et débloque
 * l'avis côté acheteur (cf. confirm-deal.ts).
 *
 * Purge : supprime les events de plus de 60 jours (toute issue) pour borner
 * la collection. À 60j, un 'pending' a forcément été 'prompted' (sweep
 * quotidien dès 48h).
 *
 * Coût : ~1 query + N writes/jour. Négligeable.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "./admin.js";

const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;
const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export const dealLoopSweep = onSchedule(
  { schedule: "30 8 * * *", timeZone: "Africa/Bujumbura", region: "europe-west1" },
  async () => {
    const db = await getDb();
    const now = Date.now();

    // ── 1. Prompt : contacts 'pending' de plus de 48h ────────────────────
    const dueSnap = await db
      .collection("contactEvents")
      .where("status", "==", "pending")
      .where("createdAt", "<", now - FORTY_EIGHT_H_MS)
      .limit(200)
      .get();

    let prompted = 0;
    for (const doc of dueSnap.docs) {
      const e = doc.data() as { sellerUid?: string; productTitle?: string };
      if (!e.sellerUid) continue;
      const title = e.productTitle || "votre produit";

      // Notif vendeur → push auto via onNotificationCreate. Le lien ouvre le
      // dashboard avec l'eventId + le titre (affichage), où le vendeur répond.
      await db.collection("notifications").add({
        userId: e.sellerUid,
        type: "deal_check",
        title: "Vente conclue ? 🤝",
        body: `Avez-vous vendu "${title}" au client qui vous a contacté ?`,
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        data: {
          link: `/dashboard?deal=${doc.id}&pt=${encodeURIComponent(title.slice(0, 40))}`,
        },
      });
      await doc.ref.update({ status: "prompted", sellerPromptedAt: now });
      prompted++;
    }
    console.log(`[dealLoopSweep] prompted ${prompted} seller(s).`);

    // ── 2. Purge : events de plus de 60 jours ────────────────────────────
    const purgeSnap = await db
      .collection("contactEvents")
      .where("createdAt", "<", now - SIXTY_DAYS_MS)
      .limit(300)
      .get();
    if (!purgeSnap.empty) {
      const batch = db.batch();
      purgeSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
      console.log(`[dealLoopSweep] purged ${purgeSnap.size} old event(s).`);
    }
  },
);

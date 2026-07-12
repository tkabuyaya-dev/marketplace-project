/**
 * NUNULIA — Notification admin « Nouveau produit à valider »
 *
 * Trigger Firestore passif sur products/{id} : détecte chaque produit qui
 * DEVIENT `pending` (création classique, annonce vocale, publication Photo
 * Studio, re-soumission après rejet — tous les chemins sont couverts sans
 * modifier aucun flow de publication).
 *
 * Pipeline : écrit dans /notifications → onNotificationCreate (fcm-send)
 * pousse automatiquement. Aucun composant FCM verrouillé modifié.
 *
 * Anti-spam (un vendeur qui publie 10 produits d'affilée ≠ 10 pushs) :
 *   - 1 push maximum par fenêtre de 10 minutes (état transactionnel dans
 *     appSettings/adminProductAlerts — lastSentAt + ids des notifs envoyées).
 *   - Pendant la fenêtre de silence, la notification in-app existante est
 *     MISE À JOUR (compteur total en attente, remise non-lue) : la cloche
 *     admin reste exacte en temps réel, sans re-push (update ≠ create,
 *     le trigger fcm-send ne se re-déclenche pas).
 *
 * Action directe : data.link = /admin?tab=products&filter=pending — le tap
 * ouvre la file de modération pré-filtrée (deep link ?tab= + &filter=).
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";

const THROTTLE_MS = 10 * 60 * 1000;
const STATE_DOC_PATH = { collection: "appSettings", doc: "adminProductAlerts" } as const;
const ADMIN_LINK = "/admin?tab=products&filter=pending";

type ProductData = {
  status?: string;
  title?: string;
  price?: number;
  currency?: string;
  sellerId?: string;
  sellerName?: string;
};

export const onProductPendingNotifyAdmin = onDocumentWritten(
  { document: "products/{productId}", region: "europe-west1" },
  async (event) => {
    const before = event.data?.before?.exists ? (event.data.before.data() as ProductData) : undefined;
    const after = event.data?.after?.exists ? (event.data.after.data() as ProductData) : undefined;

    // Seule la TRANSITION vers pending compte : une simple édition d'un
    // produit déjà pending (prix, photo…) ne re-notifie pas.
    if (!after) return;
    const becamePending = after.status === "pending" && (!before || before.status !== "pending");
    if (!becamePending) return;

    const db = await getDb();

    // Destinataires : tous les admins — sauf si le produit vient d'un admin.
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    const adminIds = adminsSnap.docs.map(d => d.id).filter(id => id !== after.sellerId);
    if (adminIds.length === 0) return;

    // Total en attente (agrégat serveur — 1 read facturé, pas N docs)
    let pendingCount = 0;
    try {
      const agg = await db.collection("products").where("status", "==", "pending").count().get();
      pendingCount = agg.data().count;
    } catch {
      pendingCount = 0; // non bloquant — le message reste valide sans total
    }

    const title = (after.title || "Nouveau produit").slice(0, 60);
    const priceStr = typeof after.price === "number"
      ? ` · ${after.price.toLocaleString("fr-FR")} ${after.currency ?? ""}`.trimEnd()
      : "";
    const shopStr = after.sellerName ? ` · ${after.sellerName}` : "";
    const countSuffix = pendingCount > 1 ? ` — ${pendingCount} produits en attente au total` : "";
    const notifTitle = "🛍️ Nouveau produit à valider";
    const notifBody = `« ${title} »${priceStr}${shopStr}${countSuffix}`;

    // ── Throttle transactionnel (2 triggers simultanés = 1 seul push) ──────
    const stateRef = db.collection(STATE_DOC_PATH.collection).doc(STATE_DOC_PATH.doc);
    const now = Date.now();

    const decision = await db.runTransaction(async (tx) => {
      const snap = await tx.get(stateRef);
      const state = (snap.exists ? snap.data() : {}) as { lastSentAt?: number; lastNotifIds?: Record<string, string> };
      const lastSentAt = typeof state.lastSentAt === "number" ? state.lastSentAt : 0;
      if (now - lastSentAt < THROTTLE_MS) {
        return { push: false as const, notifIds: state.lastNotifIds ?? {} };
      }
      tx.set(stateRef, { lastSentAt: now }, { merge: true });
      return { push: true as const, notifIds: {} as Record<string, string> };
    });

    if (decision.push) {
      // Fenêtre ouverte → nouveaux docs (le pipeline FCM pousse)
      const batch = db.batch();
      const ids: Record<string, string> = {};
      for (const adminId of adminIds) {
        const ref = db.collection("notifications").doc();
        ids[adminId] = ref.id;
        batch.set(ref, {
          userId: adminId,
          type: "admin_product_pending",
          title: notifTitle,
          body: notifBody,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          data: { link: ADMIN_LINK },
        });
      }
      batch.set(stateRef, { lastNotifIds: ids }, { merge: true });
      await batch.commit();
      logger.info("[notify-admin-on-product] push envoyé", {
        productId: event.params.productId, admins: adminIds.length, pendingCount,
      });
    } else {
      // Fenêtre de silence → on rafraîchit la notification in-app existante
      // (compteur exact, remise non-lue). Best-effort : si l'admin a supprimé
      // la notif entre-temps, l'update échoue et on ignore — le prochain
      // push (fenêtre suivante) remettra tout à jour.
      const updates = adminIds
        .map(adminId => decision.notifIds[adminId])
        .filter((id): id is string => !!id);
      await Promise.allSettled(updates.map(id =>
        db.collection("notifications").doc(id).update({
          body: notifBody,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
        }),
      ));
      logger.info("[notify-admin-on-product] fenêtre de silence — cloche mise à jour", {
        productId: event.params.productId, updated: updates.length, pendingCount,
      });
    }
  },
);

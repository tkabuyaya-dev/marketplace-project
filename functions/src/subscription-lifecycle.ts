/**
 * NUNULIA — Subscription Lifecycle (pipeline unique d'expiration) — Lot B
 *
 * Remplace les DEUX pipelines concurrents de l'audit 2026-07-09 (C2) :
 *   - `checkSubscriptions` (supprimé) : downgradait le tier à J0 et mettait
 *     subscriptionExpiresAt à null, ce qui rendait la grâce 3 phases
 *     inatteignable (une query `< now` ne matche jamais null).
 *   - `expireSellers` (conservé comme déclencheur manuel de secours) :
 *     délègue désormais à `runSubscriptionLifecycle`.
 *
 * Machine à états — sellerDetails.subscriptionState (écrite CF only) :
 *
 *   active ──(expiry)──> grace_1 ──(J+3)──> grace_2 ──(J+14)──> grace_3 ──(J+15)──> free
 *     ▲                                                                              │
 *     └────────────────────── approveRenewal (à toute étape) ◄────────────────────────┘
 *
 *   grace_1 (J0)  : status→inactive. Produits ET tier intacts — 3 jours pour
 *                   renouveler sans aucun impact (décision D3).
 *   grace_2 (J+3) : tier → Découverte/5. Produits masqués sauf top 5 (viewCount),
 *                   marqués deactivatedBy:'grace' (audit I7) — approveRenewal ne
 *                   réactive que ceux-là, les pauses manuelles sont préservées.
 *   ⚠ J+13       : notification d'ultime avertissement (graceWarnedAt). La
 *                   phase 3 EXIGE que cet avertissement ait ≥20h — garantie
 *                   de préavis même si le cron a sauté un jour.
 *   grace_3 (J+14): deleteAt posé sur tous les produits (ramassés par le cron
 *                   deleteProducts). subscriptionExpiresAt toujours intact.
 *   free   (J+15) : état terminal propre — expiry/gracePhase/guards remis à
 *                   null, status→active (un vendeur Découverte est un vendeur
 *                   normal). Le vendeur peut repartir sur le plan gratuit.
 *
 * Chaque transition écrit un auditLogs (adminId 'system') — audit I5.
 * Heartbeat : appSettings/subscriptionLifecycle (read public par les rules
 * existantes → visible dans l'admin sans modification de rules) — audit I6.
 *
 * Les champs legacy (downgradePhase, gracePhaseSince, status) restent
 * synchronisés : badges SellerDashboard/ShopProfile inchangés, zéro régression.
 * Les vendeurs en grâce legacy (downgradePhase posé par l'ancien expireSellers,
 * sans subscriptionState) sont repris par les mêmes queries et re-stampés au
 * fil des transitions.
 *
 * Idempotent : chaque étape a son guard (fenêtres de rappel dédupliquées,
 * transitions gardées par downgradePhase + délais) — un déclenchement manuel
 * en plus du schedule quotidien est sans effet de bord.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getDb } from "./admin.js";

const COLLECTIONS = {
  USERS: "users",
  PRODUCTS: "products",
  NOTIFICATIONS: "notifications",
  SUBSCRIPTION_REQUESTS: "subscriptionRequests",
  AUDIT_LOGS: "auditLogs",
  APP_SETTINGS: "appSettings",
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const GRACE2_AFTER_MS = 3 * DAY_MS;   // grace_1 → grace_2
const WARN_AFTER_MS = 13 * DAY_MS;    // avertissement ultime
const GRACE3_AFTER_MS = 14 * DAY_MS;  // grace_2 → grace_3 (deleteAt)
const FREE_AFTER_MS = 15 * DAY_MS;    // grace_3 → free (terminal)
const MIN_WARN_NOTICE_MS = 20 * 60 * 60 * 1000; // préavis mini avant deleteAt
const SEVEN_DAYS_MS = 7 * DAY_MS;
const BATCH_LIMIT = 450;
const GRACE_KEEP_TOP = 5;

const ORPHAN_REJECT_REASON =
  "Demande expirée : aucune référence de paiement reçue dans les 7 jours. Vous pouvez créer une nouvelle demande à tout moment.";

/** Fenêtres de rappel pré-expiration — guards dédupliqués par cycle (R14). */
const REMINDER_WINDOWS = [
  { id: "J7", days: 7, guardField: "reminderSentJ7" },
  { id: "J3", days: 3, guardField: "reminderSentJ3" },
  { id: "J1", days: 1, guardField: "reminderSentJ1" },
] as const;

export interface LifecycleCounts {
  remindedJ7: number;
  remindedJ3: number;
  remindedJ1: number;
  grace1: number;
  grace2: number;
  warned: number;
  grace3: number;
  freed: number;
  orphansRejected: number;
}

type Db = FirebaseFirestore.Firestore;

function notif(db: Db, batch: FirebaseFirestore.WriteBatch, userId: string, title: string, body: string, type = "subscription_change"): void {
  const ref = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
  batch.set(ref, { userId, type, title, body, read: false, createdAt: FieldValue.serverTimestamp() });
}

/** Audit I5 : chaque transition automatique laisse une trace exploitable. */
function audit(db: Db, batch: FirebaseFirestore.WriteBatch, action: string, sellerId: string, previousValue: unknown, newValue: unknown, now: number): void {
  const ref = db.collection(COLLECTIONS.AUDIT_LOGS).doc();
  batch.set(ref, {
    action,
    entityType: "subscription",
    entityId: sellerId,
    adminId: "system",
    adminEmail: "",
    previousValue: previousValue ?? null,
    newValue: newValue ?? null,
    timestamp: now,
  });
}

/** Masque/planifie des produits par lots de 450 (limite writeBatch). */
async function updateProductsInBatches(
  db: Db,
  docs: FirebaseFirestore.QueryDocumentSnapshot[],
  updateFor: (d: FirebaseFirestore.QueryDocumentSnapshot) => Record<string, unknown>,
): Promise<number> {
  let batch = db.batch();
  let ops = 0;
  let total = 0;
  for (const d of docs) {
    batch.update(d.ref, updateFor(d));
    ops++;
    total++;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) await batch.commit();
  return total;
}

export async function runSubscriptionLifecycle(db: Db, trigger: "schedule" | "manual"): Promise<LifecycleCounts> {
  const now = Date.now();
  const counts: LifecycleCounts = {
    remindedJ7: 0, remindedJ3: 0, remindedJ1: 0,
    grace1: 0, grace2: 0, warned: 0, grace3: 0, freed: 0,
    orphansRejected: 0,
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPE 1 — Rappels pré-expiration J-7 / J-3 / J-1 (logique R14 inchangée)
  // ───────────────────────────────────────────────────────────────────────────
  for (const win of REMINDER_WINDOWS) {
    const windowStart = now + (win.days - 1) * DAY_MS;
    const windowEnd = now + win.days * DAY_MS;

    const winSnap = await db
      .collection(COLLECTIONS.USERS)
      .where("sellerDetails.subscriptionExpiresAt", ">", windowStart)
      .where("sellerDetails.subscriptionExpiresAt", "<=", windowEnd)
      .get();

    for (const userDoc of winSnap.docs) {
      const sd = userDoc.data().sellerDetails ?? {};
      if ((sd.maxProducts ?? 0) <= 5) continue;               // free tier
      const expiresAt: number = sd.subscriptionExpiresAt;
      if ((sd[win.guardField] ?? null) === expiresAt) continue; // déjà notifié ce cycle

      const daysLeft = Math.ceil((expiresAt - now) / DAY_MS);
      const batch = db.batch();
      notif(
        db, batch, userDoc.id,
        `Abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        `Votre plan "${sd.tierLabel ?? "payant"}" expire bientôt. Renouvelez maintenant pour garder tous vos produits visibles.`,
        "subscription_reminder",
      );
      const update: Record<string, unknown> = { [`sellerDetails.${win.guardField}`]: expiresAt };
      if (win.id === "J3") update["sellerDetails.reminderSentForExpiry"] = expiresAt; // legacy compat
      batch.update(userDoc.ref, update);
      await batch.commit();

      if (win.id === "J7") counts.remindedJ7++;
      else if (win.id === "J3") counts.remindedJ3++;
      else counts.remindedJ1++;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPE 2 — Entrée en grâce : active + expiré → grace_1 (J0)
  // Tier et produits INTACTS (D3) — le vendeur a 3 jours sans aucun impact.
  // ───────────────────────────────────────────────────────────────────────────
  const expiredSnap = await db
    .collection(COLLECTIONS.USERS)
    .where("sellerDetails.subscriptionExpiresAt", "<", now)
    .get();

  for (const userDoc of expiredSnap.docs) {
    const data = userDoc.data();
    const sd = data.sellerDetails ?? {};
    if ((sd.maxProducts ?? 0) <= 5) continue;   // pas un plan payant
    if (data.status !== "active") continue;      // suspendu / déjà traité
    if (sd.downgradePhase) continue;             // déjà en grâce (guard re-run)

    const batch = db.batch();
    batch.update(userDoc.ref, {
      status: "inactive",
      "sellerDetails.subscriptionState": "grace_1",
      "sellerDetails.gracePhaseSince": now,
      "sellerDetails.downgradePhase": 1,
    });
    notif(
      db, batch, userDoc.id,
      "Abonnement expiré — 3 jours pour renouveler",
      `Votre plan "${sd.tierLabel ?? "payant"}" a expiré. Vos produits restent visibles pendant 3 jours. Renouvelez maintenant pour ne rien perdre.`,
    );
    audit(db, batch, "subscription_grace_1", userDoc.id,
      { tierLabel: sd.tierLabel ?? null, subscriptionExpiresAt: sd.subscriptionExpiresAt ?? null },
      { subscriptionState: "grace_1", gracePhaseSince: now }, now);
    await batch.commit();
    counts.grace1++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPE 3 — grace_1 → grace_2 (J+3) : downgrade tier + masquage sauf top 5
  // ───────────────────────────────────────────────────────────────────────────
  const phase1Snap = await db
    .collection(COLLECTIONS.USERS)
    .where("sellerDetails.downgradePhase", "==", 1)
    .get();

  for (const userDoc of phase1Snap.docs) {
    const sd = userDoc.data().sellerDetails ?? {};
    const since: number | undefined = sd.gracePhaseSince;
    if (!since || now - since < GRACE2_AFTER_MS) continue;

    const productsSnap = await db
      .collection(COLLECTIONS.PRODUCTS)
      .where("sellerId", "==", userDoc.id)
      .where("status", "==", "approved")
      .get();

    if (!productsSnap.empty) {
      // Champ réel = `views` (types.ts / incrementProductViews). L'ancien code
      // (hérité de expire-sellers R19) triait par `viewCount`, inexistant →
      // le « top 5 conservé » était arbitraire. Corrigé 2026-07-10.
      const sorted = [...productsSnap.docs].sort((a, b) =>
        ((b.data().views as number) ?? 0) - ((a.data().views as number) ?? 0));
      // I7 : marquage 'grace' — seuls ces produits seront réactivés au renouvellement
      await updateProductsInBatches(db, sorted.slice(GRACE_KEEP_TOP),
        () => ({ status: "inactive", deactivatedBy: "grace" }));
    }

    const batch = db.batch();
    batch.update(userDoc.ref, {
      "sellerDetails.subscriptionState": "grace_2",
      "sellerDetails.downgradePhase": 2,
      // D3 : le tier tombe ICI (J+3), pas à J0 — cohérent avec la promesse
      // « 3 jours sans impact » de la notification grace_1.
      "sellerDetails.maxProducts": 5,
      "sellerDetails.tierLabel": "Découverte",
    });
    notif(
      db, batch, userDoc.id,
      "Vos produits sont masqués",
      "Abonnement expiré depuis 3 jours : vous êtes repassé au plan Découverte et seuls vos 5 produits les plus consultés restent visibles. Renouvelez pour tout réactiver.",
    );
    audit(db, batch, "subscription_grace_2", userDoc.id,
      { tierLabel: sd.tierLabel ?? null, maxProducts: sd.maxProducts ?? null },
      { subscriptionState: "grace_2", tierLabel: "Découverte", maxProducts: 5 }, now);
    await batch.commit();
    counts.grace2++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPE 4 — Avertissement ultime (J+13) + grace_2 → grace_3 (J+14, deleteAt)
  // La suppression EXIGE un avertissement envoyé depuis ≥20h (préavis garanti).
  // ───────────────────────────────────────────────────────────────────────────
  const phase2Snap = await db
    .collection(COLLECTIONS.USERS)
    .where("sellerDetails.downgradePhase", "==", 2)
    .get();

  for (const userDoc of phase2Snap.docs) {
    const sd = userDoc.data().sellerDetails ?? {};
    const since: number | undefined = sd.gracePhaseSince;
    if (!since) continue;
    const elapsed = now - since;
    const warnedAt: number | null = typeof sd.graceWarnedAt === "number" ? sd.graceWarnedAt : null;
    const warnedThisCycle = warnedAt !== null && warnedAt > since;

    // 4a — avertissement J+13 (une seule fois par cycle)
    if (elapsed >= WARN_AFTER_MS && !warnedThisCycle) {
      const batch = db.batch();
      notif(
        db, batch, userDoc.id,
        "Suppression de vos produits demain",
        "Dernier rappel : sans renouvellement, vos produits seront définitivement supprimés demain. Renouvelez maintenant pour les conserver.",
      );
      batch.update(userDoc.ref, { "sellerDetails.graceWarnedAt": now });
      await batch.commit();
      counts.warned++;
      continue; // jamais deleteAt dans le même passage que l'avertissement
    }

    // 4b — grace_3 : deleteAt sur tout le catalogue
    if (elapsed >= GRACE3_AFTER_MS && warnedThisCycle && now - (warnedAt as number) >= MIN_WARN_NOTICE_MS) {
      const productsSnap = await db
        .collection(COLLECTIONS.PRODUCTS)
        .where("sellerId", "==", userDoc.id)
        .where("status", "in", ["approved", "inactive"])
        .get();

      const deleteAt = Timestamp.fromMillis(now);
      await updateProductsInBatches(db, productsSnap.docs, (d) => {
        // Les produits encore visibles (top 5) sont masqués par la grâce →
        // marqués. Les pauses manuelles (inactive sans marqueur) reçoivent
        // deleteAt mais PAS le marqueur : un renouvellement in extremis
        // annule leur suppression sans les republier (I7).
        const wasVisible = d.data().status === "approved";
        return wasVisible
          ? { status: "inactive", deleteAt, deactivatedBy: "grace" }
          : { status: "inactive", deleteAt };
      });

      const batch = db.batch();
      batch.update(userDoc.ref, {
        "sellerDetails.subscriptionState": "grace_3",
        "sellerDetails.downgradePhase": 3,
      });
      notif(
        db, batch, userDoc.id,
        "Vos produits vont être supprimés",
        "Votre abonnement a expiré il y a 14 jours : vos produits sont programmés pour suppression définitive. Renouvelez immédiatement pour les récupérer.",
      );
      audit(db, batch, "subscription_grace_3", userDoc.id,
        { subscriptionState: sd.subscriptionState ?? null },
        { subscriptionState: "grace_3", productsScheduled: productsSnap.size }, now);
      await batch.commit();
      counts.grace3++;
    }
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPE 5 — grace_3 → free (J+15) : état terminal propre
  // ───────────────────────────────────────────────────────────────────────────
  const phase3Snap = await db
    .collection(COLLECTIONS.USERS)
    .where("sellerDetails.downgradePhase", "==", 3)
    .get();

  for (const userDoc of phase3Snap.docs) {
    const sd = userDoc.data().sellerDetails ?? {};
    const since: number | undefined = sd.gracePhaseSince;
    if (!since || now - since < FREE_AFTER_MS) continue;

    const batch = db.batch();
    batch.update(userDoc.ref, {
      // Un vendeur Découverte est un vendeur actif normal (peut publier 5 produits)
      status: "active",
      "sellerDetails.subscriptionState": "free",
      "sellerDetails.subscriptionExpiresAt": null,
      "sellerDetails.gracePhaseSince": null,
      "sellerDetails.downgradePhase": null,
      "sellerDetails.graceWarnedAt": null,
      "sellerDetails.reminderSentForExpiry": null,
      "sellerDetails.reminderSentJ7": null,
      "sellerDetails.reminderSentJ3": null,
      "sellerDetails.reminderSentJ1": null,
    });
    audit(db, batch, "subscription_expired", userDoc.id,
      { subscriptionState: "grace_3" },
      { subscriptionState: "free" }, now);
    await batch.commit();
    counts.freed++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ÉTAPE 6 — Auto-reject des demandes orphelines (>7j sans transactionRef)
  // ───────────────────────────────────────────────────────────────────────────
  const orphanCutoff = now - SEVEN_DAYS_MS;
  const orphanSnap = await db
    .collection(COLLECTIONS.SUBSCRIPTION_REQUESTS)
    .where("status", "==", "pending")
    .where("createdAt", "<", orphanCutoff)
    .get();

  for (const reqDoc of orphanSnap.docs) {
    const data = reqDoc.data();
    if (data.transactionRef) continue;
    if (data.status === "cancelled") continue;
    const modifiedAt = typeof data.modifiedAt === "number" ? data.modifiedAt : 0;
    if (modifiedAt > orphanCutoff) continue; // le vendeur a interagi récemment

    const batch = db.batch();
    batch.update(reqDoc.ref, {
      status: "rejected",
      rejectionReason: ORPHAN_REJECT_REASON,
      updatedAt: now,
    });
    notif(
      db, batch, data.userId,
      "Demande d'abonnement expirée",
      `Votre demande pour le plan "${data.planLabel}" a expiré (aucun paiement reçu). Vous pouvez en créer une nouvelle à tout moment.`,
    );
    await batch.commit();
    counts.orphansRejected++;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Heartbeat (I6) — appSettings est read-public dans les rules existantes :
  // l'admin voit « dernier passage » sans aucune modification de rules.
  // ───────────────────────────────────────────────────────────────────────────
  await db.collection(COLLECTIONS.APP_SETTINGS).doc("subscriptionLifecycle").set({
    lastRunAt: now,
    trigger,
    ok: true,
    counts: { ...counts },
    durationMs: Date.now() - now,
  }, { merge: true });

  console.log(`[subscriptionLifecycle] trigger=${trigger} ${JSON.stringify(counts)}`);
  return counts;
}

/** Cron quotidien — remplace checkSubscriptions + le cron externe expireSellers. */
export const subscriptionLifecycle = onSchedule(
  {
    region: "europe-west1",
    schedule: "0 2 * * *", // 02:00 UTC (04:00 Bujumbura)
    timeZone: "UTC",
    retryCount: 1,
    maxInstances: 1,
  },
  async () => {
    const db = await getDb();
    try {
      await runSubscriptionLifecycle(db, "schedule");
    } catch (err: any) {
      // Heartbeat d'échec (best-effort) — visible dans l'admin
      try {
        await db.collection(COLLECTIONS.APP_SETTINGS).doc("subscriptionLifecycle").set({
          lastRunAt: Date.now(),
          trigger: "schedule",
          ok: false,
          error: String(err?.message ?? err),
        }, { merge: true });
      } catch { /* ignore */ }
      throw err;
    }
  },
);

/**
 * NUNULIA — Coach vendeur (moteur de la « prochaine meilleure action »)
 *
 * Cron quotidien 16:00 UTC (≈ 18h Bujumbura/Goma, 17h Kinshasa, 19h Dar) :
 * pour chaque vendeur, calcule LA meilleure action suivante et envoie AU PLUS
 * UNE notification — jamais une rafale, jamais un « revenez nous voir ».
 *
 * Formule fixe de chaque message : 1 fait réel sur SA boutique + 1 action
 * précise + 1 bénéfice. Pipeline : write /notifications → fcm-send pousse.
 * Aucun composant FCM verrouillé modifié, aucune rule modifiée.
 *
 * Moments (par priorité décroissante) :
 *   j1     — J+1 à J+4, 0 produit : premier produit (vend la dictée vocale)
 *   j3     — J+3 à J+14, 1-4 produits : compléter la vitrine
 *   boost  — produit star (≥ 30 vues, non boosté) : nudge boost au moment
 *            où le produit performe (re-proposable après 30 jours)
 *   studio — plan payant actif, Photo Studio jamais utilisé (une seule fois)
 *   digest — dimanche : « Votre semaine NUNULIA » (delta de vues réel ;
 *            1ᵉʳ dimanche = calibration silencieuse, envoi dès le 2ᵉ)
 *
 * Garde-fous NON NÉGOCIABLES (dans le moteur, pas en bonne volonté) :
 *   - kill switch + fréquence : appSettings/sellerCoach { enabled, maxPerWeek }
 *     (lisible/modifiable en temps réel — carte dans l'admin Overview)
 *   - cap hebdo : maxPerWeek (défaut 2), jamais 2 jours de suite (≥ 40h)
 *   - opt-out vendeur : sellerDetails.coachOptOut (toggle dans le Profil)
 *   - vendeurs suspendus ou en grâce d'abonnement : exclus (ils ont déjà
 *     leurs propres notifications, on ne superpose pas)
 *   - état par vendeur : sellerDetails.coachState (guards par moment)
 *
 * Le match « demande d'acheteur → vendeurs de la catégorie » existe déjà
 * (onBuyerRequestMatch, en prod) — le Coach ne le duplique pas.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { getDb } from "./admin.js";
import { planIdFromLabel } from "./plan-features.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MIN_GAP_MS = 40 * HOUR_MS;          // jamais 2 jours de suite
const DEFAULT_MAX_PER_WEEK = 2;
const BOOST_MIN_VIEWS = 30;
const BOOST_RENUDGE_MS = 30 * DAY_MS;
const DIGEST_MIN_DELTA = 5;               // < 5 vues gagnées → rien d'excitant, silence
const MAX_SELLERS = 2000;                 // garde-fou de scan

type CoachState = {
  lastSentAt?: number;
  weekKey?: number;
  weekCount?: number;
  j1Done?: boolean;
  j3Done?: boolean;
  boostNudgeAt?: number;
  studioNudgeDone?: boolean;
  digestViews?: number;
  digestLastAt?: number;
};

type Moment = { type: string; title: string; body: string; link: string; stateDelta: Partial<CoachState> };

export const sellerCoach = onSchedule(
  {
    region: "europe-west1",
    schedule: "0 16 * * *", // 16:00 UTC quotidien
    timeZone: "UTC",
    retryCount: 0, // jamais de double envoi sur retry — un jour raté n'est pas grave
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async () => {
    const db = await getDb();
    const now = Date.now();
    const weekKey = Math.floor(now / (7 * DAY_MS));
    const isSunday = new Date(now).getUTCDay() === 0;

    // ── Kill switch + fréquence (temps réel, sans redéploiement) ────────────
    const settingsSnap = await db.collection("appSettings").doc("sellerCoach").get();
    const settings = (settingsSnap.exists ? settingsSnap.data() : {}) as { enabled?: boolean; maxPerWeek?: number };
    if (settings.enabled === false) {
      logger.info("[seller-coach] kill switch actif — run sauté");
      return;
    }
    const maxPerWeek = typeof settings.maxPerWeek === "number" && settings.maxPerWeek > 0
      ? settings.maxPerWeek
      : DEFAULT_MAX_PER_WEEK;

    const sellersSnap = await db
      .collection("users")
      .where("role", "==", "seller")
      .limit(MAX_SELLERS)
      .get();

    // Cache boostPricing par pays (1 read max par pays et par run)
    const boostPricingCache = new Map<string, { amount: number; currency: string } | null>();
    const getBoostPricing = async (countryId: string) => {
      if (!boostPricingCache.has(countryId)) {
        try {
          const snap = await db.collection("boostPricing").doc(countryId).get();
          const d = snap.exists ? (snap.data() as any) : null;
          boostPricingCache.set(
            countryId,
            d && typeof d.amount === "number" ? { amount: d.amount, currency: d.currency ?? "" } : null,
          );
        } catch {
          boostPricingCache.set(countryId, null);
        }
      }
      return boostPricingCache.get(countryId) ?? null;
    };

    const counts: Record<string, number> = { j1: 0, j3: 0, boost: 0, studio: 0, digest: 0, skipped: 0 };

    for (const sellerDoc of sellersSnap.docs) {
      try {
        const user = sellerDoc.data() as any;
        const sd = user.sellerDetails ?? {};
        const state: CoachState = sd.coachState ?? {};

        // ── Exclusions dures ────────────────────────────────────────────────
        if (user.isSuspended) continue;
        if (sd.coachOptOut === true) continue;
        if (sd.downgradePhase) continue; // en grâce : déjà notifié par le pipeline abonnement

        // ── Caps de fréquence ───────────────────────────────────────────────
        const weekCount = state.weekKey === weekKey ? (state.weekCount ?? 0) : 0;
        if (weekCount >= maxPerWeek) continue;
        if (state.lastSentAt && now - state.lastSentAt < MIN_GAP_MS) continue;

        const productCount: number = user.productCount ?? 0;
        const joinedAgo = typeof user.joinDate === "number" ? now - user.joinDate : Number.MAX_SAFE_INTEGER;
        const shopName: string = sd.shopName || user.name || "votre boutique";
        const maxProducts: number = sd.maxProducts ?? 5;
        const countryId: string = sd.countryId || "bi";

        let moment: Moment | null = null;

        // ── j1 : premier produit ───────────────────────────────────────────
        if (!moment && !state.j1Done && productCount === 0
            && joinedAgo >= 20 * HOUR_MS && joinedAgo <= 4 * DAY_MS) {
          moment = {
            type: "coach_j1",
            title: "Votre boutique vous attend 🛍️",
            body: `${shopName} est prête et déjà visible sur NUNULIA. Ajoutez votre 1er produit en 2 minutes — une photo, dictez le reste 🎙️`,
            link: "/dashboard",
            stateDelta: { j1Done: true },
          };
        }

        // ── j3 : compléter la vitrine ──────────────────────────────────────
        if (!moment && !state.j3Done && productCount >= 1 && productCount <= 4
            && joinedAgo >= 3 * DAY_MS && joinedAgo <= 14 * DAY_MS) {
          moment = {
            type: "coach_j3",
            title: "Plus de produits = plus de visites 📈",
            body: `Votre boutique compte ${productCount} produit${productCount > 1 ? "s" : ""} — les boutiques avec 5 produits et plus reçoivent bien plus de visites. Votre plan en autorise ${maxProducts >= 99999 ? "un nombre illimité" : maxProducts}.`,
            link: "/dashboard",
            stateDelta: { j3Done: true },
          };
        }

        // ── boost / digest : besoin des produits (1 seule query, projetée) ──
        const wantBoost = !moment && productCount > 0
          && (!state.boostNudgeAt || now - state.boostNudgeAt > BOOST_RENUDGE_MS);
        const wantDigest = productCount > 0 && isSunday;

        let approved: Array<{ title: string; views: number; isBoosted: boolean; boostExpiresAt: number }> = [];
        if (wantBoost || wantDigest) {
          const prodSnap = await db
            .collection("products")
            .where("sellerId", "==", sellerDoc.id)
            .select("title", "views", "status", "isBoosted", "boostExpiresAt")
            .limit(150)
            .get();
          approved = prodSnap.docs
            .map(d => d.data() as any)
            .filter(p => p.status === "approved")
            .map(p => ({
              title: (p.title as string) || "Votre produit",
              views: typeof p.views === "number" ? p.views : 0,
              isBoosted: !!p.isBoosted,
              boostExpiresAt: typeof p.boostExpiresAt === "number" ? p.boostExpiresAt : 0,
            }))
            .sort((a, b) => b.views - a.views);
        }
        const star = approved[0];

        // ── boost : le produit star performe, c'est LE moment ─────────────
        if (wantBoost && star && star.views >= BOOST_MIN_VIEWS
            && !(star.isBoosted && star.boostExpiresAt > now)) {
          const pricing = await getBoostPricing(countryId);
          const amountStr = pricing ? ` (${pricing.amount.toLocaleString("fr-FR")} ${pricing.currency})` : "";
          moment = {
            type: "coach_boost",
            title: "🔥 Votre produit star",
            body: `« ${star.title.slice(0, 50)} » a été vu ${star.views} fois — c'est votre produit le plus consulté. Boostez-le${amountStr} : 7 jours en tête de la Home.`,
            link: "/dashboard",
            stateDelta: { boostNudgeAt: now },
          };
        }

        // ── studio : avantage payé jamais utilisé (une seule fois) ─────────
        if (!moment && !state.studioNudgeDone) {
          const planId = planIdFromLabel(sd.tierLabel);
          const paidActive = planId !== null && planId !== "free"
            && typeof sd.subscriptionExpiresAt === "number" && sd.subscriptionExpiresAt > now;
          if (paidActive && productCount > 0 && joinedAgo > 7 * DAY_MS) {
            const sessionSnap = await db
              .collection("photoSessions")
              .where("vendorId", "==", sellerDoc.id)
              .limit(1)
              .get();
            if (sessionSnap.empty) {
              moment = {
                type: "coach_studio",
                title: "📸 Sublimez vos photos",
                body: `Votre plan ${sd.tierLabel} inclut des séances Photo Studio chaque jour — vous n'en avez encore utilisé aucune. Des photos pro attirent bien plus de clics.`,
                link: "/dashboard",
                stateDelta: { studioNudgeDone: true },
              };
            } else {
              // A déjà utilisé le Studio : guard posé sans notification
              await sellerDoc.ref.update({ "sellerDetails.coachState.studioNudgeDone": true });
            }
          }
        }

        // ── digest dominical : « Votre semaine NUNULIA » ───────────────────
        if (!moment && wantDigest && star) {
          const totalViews = approved.reduce((s, p) => s + p.views, 0);
          if (state.digestViews === undefined) {
            // 1er dimanche : calibration silencieuse de la baseline
            await sellerDoc.ref.update({ "sellerDetails.coachState.digestViews": totalViews });
          } else {
            const delta = totalViews - state.digestViews;
            if (delta >= DIGEST_MIN_DELTA) {
              moment = {
                type: "coach_digest",
                title: "📬 Votre semaine NUNULIA",
                body: `Cette semaine : +${delta} vues sur vos ${approved.length} produits. Votre produit star : « ${star.title.slice(0, 50)} ».`,
                link: "/dashboard",
                stateDelta: { digestViews: totalViews, digestLastAt: now },
              };
            }
            // delta faible : silence (la baseline reste, le delta cumule)
          }
        }

        if (!moment) { counts.skipped++; continue; }

        // ── Envoi : 1 notification + état mis à jour atomiquement ──────────
        const batch = db.batch();
        const notifRef = db.collection("notifications").doc();
        batch.set(notifRef, {
          userId: sellerDoc.id,
          type: moment.type,
          title: moment.title,
          body: moment.body,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          data: { link: moment.link },
        });
        batch.update(sellerDoc.ref, {
          "sellerDetails.coachState": {
            ...state,
            ...moment.stateDelta,
            lastSentAt: now,
            weekKey,
            weekCount: weekCount + 1,
          },
        });
        await batch.commit();

        const key = moment.type.replace("coach_", "");
        counts[key] = (counts[key] ?? 0) + 1;
      } catch (err: any) {
        // Un vendeur en erreur ne doit jamais bloquer les autres
        logger.warn("[seller-coach] vendeur sauté sur erreur", {
          sellerId: sellerDoc.id, error: String(err?.message ?? err),
        });
      }
    }

    // Heartbeat (visible dans l'admin, appSettings est read-public)
    await db.collection("appSettings").doc("sellerCoach").set({
      lastRunAt: now,
      lastCounts: counts,
    }, { merge: true });

    logger.info(`[seller-coach] run terminé ${JSON.stringify(counts)} (scannés=${sellersSnap.size})`);
  },
);

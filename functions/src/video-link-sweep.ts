/**
 * NUNULIA — Vitrine Vidéo : sweep hebdomadaire anti-liens-morts.
 *
 * Tourne chaque lundi 04:30 UTC. Pour chaque produit approuvé avec vidéo :
 * - TikTok / YouTube : vérifie la vidéo via l'endpoint oEmbed public
 *   (gratuit, sans clé). 404/400 = vidéo supprimée ou passée en privé.
 * - Facebook / Instagram : invérifiable sans app Meta approuvée → ignoré.
 *
 * Règles de robustesse :
 * - Un lien n'est désactivé qu'après DEUX sweeps consécutifs en échec
 *   (videoDeadCount) — les oEmbed ont des ratés passagers, jamais de faux
 *   positif sur un seul échec. Un succès remet le compteur à zéro.
 * - Désactivation = hasVideo:false uniquement (le badge et le rail
 *   disparaissent). videoUrl est CONSERVÉ pour que le vendeur puisse le
 *   corriger, et l'annonce n'est jamais touchée.
 * - Le vendeur est notifié via le pipeline notifications existant
 *   (onNotificationCreate → cloche in-app + push FCM). Aucune modification
 *   de l'architecture FCM verrouillée.
 */

import { onSchedule } from "firebase-functions/v2/scheduler";
import { getDb } from "./admin.js";

const BATCH_LIMIT = 400;
/** Pause entre requêtes oEmbed — politesse envers les endpoints publics. */
const THROTTLE_MS = 250;
const OEMBED_TIMEOUT_MS = 8000;

type CheckResult = "alive" | "dead" | "unknown";

function oembedEndpoint(videoUrl: string): string | null {
  let host: string;
  try { host = new URL(videoUrl).hostname.toLowerCase(); } catch { return null; }
  if (/(^|\.)tiktok\.com$/.test(host)) {
    return `https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`;
  }
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) {
    return `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(videoUrl)}`;
  }
  // facebook / instagram : oEmbed verrouillé par Meta → invérifiable.
  return null;
}

async function checkVideo(videoUrl: string): Promise<CheckResult> {
  const endpoint = oembedEndpoint(videoUrl);
  if (!endpoint) return "unknown";
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OEMBED_TIMEOUT_MS);
    const res = await fetch(endpoint, {
      signal: ctrl.signal,
      headers: { "User-Agent": "NunuliaLinkCheck/1.0 (+https://nunulia.com)" },
    });
    clearTimeout(timer);
    if (res.ok) return "alive";
    // 400/404 = vidéo supprimée/privée. 403 TikTok = souvent géo/rate-limit,
    // et 5xx = incident plateforme → "unknown", on ne compte pas d'échec.
    if (res.status === 400 || res.status === 404) return "dead";
    return "unknown";
  } catch {
    // Timeout / réseau : jamais un échec imputé au vendeur.
    return "unknown";
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const videoLinkSweep = onSchedule(
  {
    region:       "europe-west1",
    schedule:     "30 4 * * 1", // lundi 04:30 UTC (06:30 Bujumbura)
    timeZone:     "UTC",
    retryCount:   1,
    maxInstances: 1,
    timeoutSeconds: 540, // volume × throttle 250ms — large marge
  },
  async () => {
    const db = await getDb();

    const snap = await db
      .collection("products")
      .where("hasVideo", "==", true)
      .where("status", "==", "approved")
      .get();

    if (snap.empty) {
      console.log("[videoLinkSweep] No products with video.");
      return;
    }
    console.log(`[videoLinkSweep] Checking ${snap.size} video link(s).`);

    let dead = 0, revived = 0, disabled = 0;
    const updates: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }> = [];
    const notifs: Array<Record<string, unknown>> = [];
    const now = Date.now();

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const videoUrl = data.videoUrl as string | undefined;
      if (!videoUrl) {
        // Incohérence hasVideo=true sans URL — auto-réparation.
        updates.push({ ref: docSnap.ref, data: { hasVideo: false } });
        continue;
      }

      const result = await checkVideo(videoUrl);
      await sleep(THROTTLE_MS);

      const prevCount = (data.videoDeadCount as number) || 0;

      if (result === "alive" && prevCount > 0) {
        revived++;
        updates.push({ ref: docSnap.ref, data: { videoDeadCount: 0 } });
      } else if (result === "dead") {
        dead++;
        if (prevCount + 1 >= 2) {
          // 2e échec consécutif → on masque la vidéo, on garde l'URL.
          disabled++;
          updates.push({ ref: docSnap.ref, data: { hasVideo: false, videoDeadCount: prevCount + 1 } });
          if (data.sellerId) {
            notifs.push({
              userId:    data.sellerId,
              type:      "video_link_dead",
              title:     "🎥 Vidéo introuvable",
              body:      `La vidéo liée à "${data.title ?? "votre produit"}" n'est plus accessible (supprimée ou privée). Reliez une nouvelle vidéo depuis votre annonce.`,
              read:      false,
              createdAt: now,
              data:      { productId: docSnap.id },
            });
          }
        } else {
          updates.push({ ref: docSnap.ref, data: { videoDeadCount: prevCount + 1 } });
        }
      }
      // "unknown" → aucun write, aucun compteur : bénéfice du doute.
    }

    for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      updates.slice(i, i + BATCH_LIMIT).forEach(u => batch.update(u.ref, u.data));
      await batch.commit();
    }
    for (let i = 0; i < notifs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      notifs.slice(i, i + BATCH_LIMIT).forEach(n => batch.set(db.collection("notifications").doc(), n));
      await batch.commit();
    }

    console.log(`[videoLinkSweep] Done. dead=${dead} disabled=${disabled} revived=${revived} checked=${snap.size}.`);
  }
);

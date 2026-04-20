/**
 * NUNULIA — Monitoring & Backup Cloud Functions
 *
 * 1. getAlgoliaUsage        — Current month's Algolia search ops count
 * 2. getDailyStats          — Firestore stats for the daily admin email report
 * 3. triggerFirestoreBackup — Exports all Firestore collections to GCS
 *
 * All endpoints require: Authorization: Bearer NUNULIA_SECRET_TOKEN
 */

import { onRequest } from "firebase-functions/v2/https";
import { getDb } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

const PROJECT_ID = "aurburundi-e2fe2";
// Default Firebase Storage bucket — used for Firestore backups
const BACKUP_BUCKET = `gs://aurburundi-e2fe2-backups/firestore-backups`;

// ── Auth helper ───────────────────────────────────────────────────────────────

function isAuthorized(req: any, secret: string): boolean {
  const authHeader = (req.headers["authorization"] ?? "") as string;
  return authHeader === `Bearer ${secret.trim()}`;
}

// ── GCP metadata server — get OAuth2 access token for REST API calls ─────────

async function getGcpAccessToken(): Promise<string> {
  const response = await fetch(
    "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
    { headers: { "Metadata-Flavor": "Google" } }
  );
  if (!response.ok) throw new Error("Failed to fetch GCP access token from metadata server");
  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. GET ALGOLIA USAGE
// Called daily by n8n to check if monthly search ops exceed the alert threshold.
// Returns: { totalSearchOps, percentUsed, isAboveThreshold, ... }
// ─────────────────────────────────────────────────────────────────────────────

export const getAlgoliaUsage = onRequest(
  {
    maxInstances: 1,
    region: "europe-west1",
    secrets: [NUNULIA_SECRET_TOKEN],
  },
  async (req, res) => {
    if (!isAuthorized(req, NUNULIA_SECRET_TOKEN.value())) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      // Read search count from Firestore (tracked by cachedSearch on every call)
      const now = new Date();
      const month = now.toISOString().slice(0, 7); // YYYY-MM
      const startDate = `${month}-01`;
      const endDate = now.toISOString().split("T")[0];

      const db = await getDb();
      const snap = await db.collection("_stats").doc(`searches_${month}`).get();
      const total = snap.exists ? (snap.data()?.count ?? 0) : 0;

      const MONTHLY_LIMIT = 10_000;
      const ALERT_THRESHOLD = 7_000;

      res.json({
        success: true,
        period: { startDate, endDate },
        totalSearchOps: total,
        monthlyLimit: MONTHLY_LIMIT,
        alertThreshold: ALERT_THRESHOLD,
        percentUsed: Math.round((total / MONTHLY_LIMIT) * 100),
        isAboveThreshold: total >= ALERT_THRESHOLD,
      });
    } catch (err: any) {
      console.error("[getAlgoliaUsage] Error:", err?.message);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET DAILY STATS
// Called every morning by n8n to build the admin email report.
// Returns: { pendingProductsCount, newSellersLast24h, subscriptionsExpiringSoon, activeBuyerRequests }
// ─────────────────────────────────────────────────────────────────────────────

export const getDailyStats = onRequest(
  {
    maxInstances: 1,
    region: "europe-west1",
    secrets: [NUNULIA_SECRET_TOKEN],
  },
  async (req, res) => {
    if (!isAuthorized(req, NUNULIA_SECRET_TOKEN.value())) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      const db = await getDb();
      const now = Date.now();
      const yesterday = now - 24 * 60 * 60 * 1000;
      const in3Days = now + 3 * 24 * 60 * 60 * 1000;

      // Run all queries in parallel for speed
      const [pendingSnap, newSellersSnap, allSellersSnap, activeRequestsSnap] = await Promise.all([
        // Products waiting for admin approval
        db.collection("products").where("status", "==", "pending").get(),
        // New sellers registered in the last 24h
        db.collection("users")
          .where("role", "==", "seller")
          .where("joinDate", ">=", yesterday)
          .get(),
        // All sellers — filter expiring subscriptions in memory (avoids composite index)
        db.collection("users").where("role", "==", "seller").get(),
        // Active buyer requests ("Je Cherche")
        db.collection("buyerRequests").where("status", "==", "active").get(),
      ]);

      // Count sellers whose subscription expires in the next 3 days
      const expiringSoonCount = allSellersSnap.docs.filter(doc => {
        const expiresAt = doc.data().sellerDetails?.subscriptionExpiresAt;
        return expiresAt && expiresAt >= now && expiresAt <= in3Days;
      }).length;

      const reportDate = new Date().toLocaleDateString("fr-FR", {
        timeZone: "Africa/Bujumbura",
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      res.json({
        success: true,
        reportDate,
        stats: {
          pendingProductsCount: pendingSnap.size,
          newSellersLast24h: newSellersSnap.size,
          totalActiveSellers: allSellersSnap.size,
          subscriptionsExpiringSoon: expiringSoonCount,
          activeBuyerRequests: activeRequestsSnap.size,
        },
      });
    } catch (err: any) {
      console.error("[getDailyStats] Error:", err?.message);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRIGGER FIRESTORE BACKUP
// Called weekly by n8n (every Sunday at 01:00 UTC).
// Exports all Firestore collections to GCS bucket — async operation (returns immediately).
// ─────────────────────────────────────────────────────────────────────────────

export const triggerFirestoreBackup = onRequest(
  {
    maxInstances: 1,
    timeoutSeconds: 60,
    region: "europe-west1",
    secrets: [NUNULIA_SECRET_TOKEN],
  },
  async (req, res) => {
    if (!isAuthorized(req, NUNULIA_SECRET_TOKEN.value())) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    try {
      const accessToken = await getGcpAccessToken();
      const timestamp = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      const outputUriPrefix = `${BACKUP_BUCKET}/${timestamp}`;

      const response = await fetch(
        `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default):exportDocuments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            outputUriPrefix,
            collectionIds: [], // empty = export ALL collections
          }),
        }
      );

      const json = (await response.json()) as { name?: string; error?: { message: string } };

      if (!response.ok) {
        console.error("[triggerFirestoreBackup] GCP error:", json.error?.message);
        res.status(502).json({
          success: false,
          message: json.error?.message ?? "Firestore export API error",
        });
        return;
      }

      console.log(`[triggerFirestoreBackup] Export started — operation: ${json.name}`);
      res.json({
        success: true,
        message: "Backup started successfully",
        outputUriPrefix,
        timestamp,
        operationName: json.name,
      });
    } catch (err: any) {
      console.error("[triggerFirestoreBackup] Error:", err?.message);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error" });
    }
  }
);

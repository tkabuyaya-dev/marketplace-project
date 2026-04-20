/**
 * NUNULIA — Sync User Role → Firebase Auth Custom Claims (A2)
 *
 * Two exports :
 *
 *   1. onUserRoleWrite  — Firestore trigger.
 *      Watches `users/{uid}` ; whenever `role` or `isSuspended` changes,
 *      mirrors the value into the Firebase Auth custom claims
 *      (`{ role, suspended }`) and bumps `claimsUpdatedAt` on the same doc.
 *      The front-end uses `claimsUpdatedAt` as a signal to `getIdToken(true)`.
 *
 *   2. backfillUserClaims — HTTP endpoint protected by NUNULIA_SECRET_TOKEN.
 *      One-shot bootstrap : paginates ALL existing users in batches of 100,
 *      sets their claims, waits 500 ms between batches to stay under the
 *      Auth admin API quota (~10 req/s/project). Safe to re-run.
 *
 * Deployment order (per plan A2, étape 1) :
 *   - Deploy these 2 functions ALONE (no rules, no front changes yet).
 *   - Run `curl -H "Authorization: Bearer $TOKEN" .../backfillUserClaims`.
 *   - Verify via `firebase auth:get-user <admin-uid>` that
 *     `customClaims.role === 'admin'`.
 *   - Only then proceed with rules + front migration.
 */

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue } from "firebase-admin/firestore";
import { getDb, getAuth } from "./admin.js";
import { NUNULIA_SECRET_TOKEN } from "./config.js";

type Role = "admin" | "seller" | "buyer";

function normalizeRole(raw: unknown): Role {
  return raw === "admin" || raw === "seller" ? raw : "buyer";
}

/**
 * Write custom claims for one user. Safe to call repeatedly — setCustomUserClaims
 * overwrites the entire claims object (intentional: any stale claim is wiped).
 * Swallows `auth/user-not-found` (race condition when Firestore doc outlives Auth).
 */
async function writeClaims(uid: string, role: Role, suspended: boolean): Promise<void> {
  const auth = await getAuth();
  try {
    await auth.setCustomUserClaims(uid, { role, suspended });
  } catch (err: any) {
    if (err?.code === "auth/user-not-found") {
      logger.warn(`[syncClaims] Auth user missing for uid=${uid} — skipping claim write`);
      return;
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────
// 1. Firestore trigger — ongoing sync
// ─────────────────────────────────────────────────────────────────────

export const onUserRoleWrite = onDocumentWritten(
  {
    document:     "users/{userId}",
    region:       "europe-west1",
    maxInstances: 10,
  },
  async (event) => {
    const before = event.data?.before?.data();
    const after  = event.data?.after?.data();
    const uid    = event.params.userId;

    // Document deleted → strip claims (defense in depth, mostly cosmetic since
    // the Auth user itself is usually deleted around the same time).
    if (!after) {
      try {
        await writeClaims(uid, "buyer", false);
      } catch (err: any) {
        logger.warn(`[onUserRoleWrite] reset claims on delete failed uid=${uid}`, err?.message);
      }
      return;
    }

    const newRole      = normalizeRole(after.role);
    const newSuspended = after.isSuspended === true;
    const oldRole      = normalizeRole(before?.role);
    const oldSuspended = before?.isSuspended === true;

    // No-op guard — protects against trigger feedback loop from our own
    // `claimsUpdatedAt` write below. Also cuts 99 % of writes that never
    // touch role/suspension.
    if (newRole === oldRole && newSuspended === oldSuspended) return;

    logger.info(
      `[onUserRoleWrite] uid=${uid} role=${oldRole}→${newRole} suspended=${oldSuspended}→${newSuspended}`
    );

    await writeClaims(uid, newRole, newSuspended);

    // Signal to the front-end's onSnapshot listener → triggers getIdToken(true).
    const db = await getDb();
    await db.collection("users").doc(uid).update({
      claimsUpdatedAt: FieldValue.serverTimestamp(),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────
// 2. Backfill callable — bootstrap pass over existing users
// ─────────────────────────────────────────────────────────────────────

const INTER_BATCH_DELAY_MS = 500;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export const backfillUserClaims = onRequest(
  {
    region:         "europe-west1",
    secrets:        [NUNULIA_SECRET_TOKEN],
    maxInstances:   1,
    timeoutSeconds: 540,
    memory:         "512MiB",
  },
  async (req, res) => {
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      logger.warn("[backfillUserClaims] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ success: false, message: "POST required" });
      return;
    }

    const startedAt = Date.now();
    const auth = await getAuth();
    const db = await getDb();

    let batchNum = 0;
    let totalProcessed = 0;
    let withFsDoc = 0;
    let withoutFsDoc = 0;
    let totalErrors = 0;
    const errors: Array<{ uid: string; message: string }> = [];
    const missingDocs: string[] = [];
    const adminUids: string[] = [];

    try {
      // Iterate Firebase Auth users (source of truth for "who needs claims").
      // For each, look up users/{uid} in Firestore to derive role + suspended.
      // If no Firestore doc exists, default to buyer/false.
      let pageToken: string | undefined = undefined;
      while (true) {
        const page = await auth.listUsers(1000, pageToken);
        if (page.users.length === 0 && !page.pageToken) break;

        batchNum++;

        for (const authUser of page.users) {
          const uid = authUser.uid;
          try {
            const docSnap = await db.collection("users").doc(uid).get();
            let role: Role = "buyer";
            let suspended = false;
            if (docSnap.exists) {
              const data = docSnap.data() || {};
              role = normalizeRole(data.role);
              suspended = data.isSuspended === true;
              withFsDoc++;
            } else {
              withoutFsDoc++;
              missingDocs.push(uid);
            }

            await auth.setCustomUserClaims(uid, { role, suspended });
            totalProcessed++;
            if (role === "admin") adminUids.push(uid);

            logger.info(
              `[backfillUserClaims] ok uid=${uid} role=${role} suspended=${suspended} fsDoc=${docSnap.exists}`
            );
          } catch (err: any) {
            totalErrors++;
            errors.push({ uid, message: err?.message || "unknown" });
            logger.error(`[backfillUserClaims] uid=${uid} failed:`, err?.message);
          }
        }

        logger.info(
          `[backfillUserClaims] batch=${batchNum} size=${page.users.length} totalProcessed=${totalProcessed} totalErrors=${totalErrors}`
        );

        if (!page.pageToken) break;
        pageToken = page.pageToken;
        await sleep(INTER_BATCH_DELAY_MS);
      }

      const elapsedMs = Date.now() - startedAt;
      logger.info(
        `[backfillUserClaims] DONE batches=${batchNum} processed=${totalProcessed} withFsDoc=${withFsDoc} withoutFsDoc=${withoutFsDoc} errors=${totalErrors} elapsed=${elapsedMs}ms`
      );

      res.json({
        success:   totalErrors === 0,
        batches:   batchNum,
        processed: totalProcessed,
        withFsDoc,
        withoutFsDoc,
        missingFsDocsSample: missingDocs.slice(0, 20),
        adminUids,
        errors:    totalErrors,
        elapsedMs,
        errorSample: errors.slice(0, 20),
      });
    } catch (err: any) {
      logger.error("[backfillUserClaims] Fatal:", err?.message, err?.stack);
      res.status(500).json({
        success:   false,
        message:   err?.message || "internal error",
        batches:   batchNum,
        processed: totalProcessed,
        errors:    totalErrors,
      });
    }
  }
);

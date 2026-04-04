/**
 * NUNULIA — Delete Expired Products (HTTP Cloud Function)
 *
 * POST /deleteProducts
 * Authorization: Bearer NUNULIA_SECRET_TOKEN
 *
 * Finds products where deleteAt < now.
 * - Deletes the image from Cloudinary using cloudinaryPublicId
 * - Deletes the Firestore product document
 *
 * Returns: { success: boolean, message: string, count: number }
 *
 * Designed to be called by an external cron scheduler once per day,
 * after expireSellers has run.
 */

import { onRequest } from "firebase-functions/v2/https";
import { createHash } from "crypto";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "./admin.js";
import {
  NUNULIA_SECRET_TOKEN,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "./config.js";

/**
 * Deletes an asset from Cloudinary using the Upload API signed destroy endpoint.
 * Signature: SHA1("public_id={id}&timestamp={ts}{api_secret}")
 */
async function deleteFromCloudinary(
  publicId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();

  // Build signature string (params sorted alphabetically, then api_secret appended)
  const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
  const signature = createHash("sha1").update(signatureString).digest("hex");

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    signature,
    api_key: apiKey,
    invalidate: "true",
  });

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloudinary destroy failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as { result?: string };
  if (json.result !== "ok" && json.result !== "not found") {
    throw new Error(`Cloudinary returned unexpected result: ${json.result}`);
  }

  console.log(`[deleteProducts] Cloudinary delete OK — publicId: ${publicId}, result: ${json.result}`);
}

export const deleteProducts = onRequest(
  {
    maxInstances: 1,
    timeoutSeconds: 540, // 9 min — may process many products
    secrets: [
      NUNULIA_SECRET_TOKEN,
      CLOUDINARY_CLOUD_NAME,
      CLOUDINARY_API_KEY,
      CLOUDINARY_API_SECRET,
    ],
    region: "europe-west1",
  },
  async (req, res) => {
    // ── Auth check ──
    const authHeader = req.headers["authorization"] ?? "";
    if (authHeader !== `Bearer ${NUNULIA_SECRET_TOKEN.value().trim()}`) {
      console.warn("[deleteProducts] Unauthorized request");
      res.status(401).json({ success: false, message: "Unauthorized", count: 0 });
      return;
    }

    try {
    const db = await getDb();
    const now = Timestamp.now();

    // ── Query products past their deleteAt date ──
    const productsSnap = await db
      .collection("products")
      .where("deleteAt", "<", now)
      .limit(500)
      .get();

    if (productsSnap.empty) {
      console.log("[deleteProducts] No products to delete.");
      res.json({ success: true, message: "No products to delete.", count: 0 });
      return;
    }

    console.log(`[deleteProducts] Found ${productsSnap.size} product(s) to delete.`);

    const cloudName = CLOUDINARY_CLOUD_NAME.value();
    const apiKey = CLOUDINARY_API_KEY.value();
    const apiSecret = CLOUDINARY_API_SECRET.value();

    let deleted = 0;
    let cloudinaryErrors = 0;

    for (const productDoc of productsSnap.docs) {
      const data = productDoc.data();
      const productId = productDoc.id;
      const publicId: string | undefined = data.cloudinaryPublicId;

      // 1. Delete from Cloudinary (if image exists)
      if (publicId) {
        try {
          await deleteFromCloudinary(publicId, cloudName, apiKey, apiSecret);
        } catch (err) {
          // Log but do not abort — always delete the Firestore doc
          console.error(
            `[deleteProducts] Cloudinary error for product ${productId}:`,
            err
          );
          cloudinaryErrors++;
        }
      } else {
        console.log(`[deleteProducts] Product ${productId} has no cloudinaryPublicId — skipping Cloudinary.`);
      }

      // 2. Delete Firestore document
      await productDoc.ref.delete();
      console.log(`[deleteProducts] Firestore document ${productId} deleted.`);

      deleted++;
    }

    res.json({
      success: true,
      message: `${deleted} product(s) deleted. ${cloudinaryErrors} Cloudinary error(s).`,
      count: deleted,
    });
    } catch (err: any) {
      console.error("[deleteProducts] Error:", err?.message ?? err);
      res.status(500).json({ success: false, message: err?.message ?? "Internal error", count: 0 });
    }
  }
);

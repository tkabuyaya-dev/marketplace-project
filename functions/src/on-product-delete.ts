/**
 * NUNULIA — Cloudinary Cleanup on Product Deletion
 *
 * Firestore trigger: fires whenever a product document is deleted,
 * regardless of who deleted it (seller, admin, or the deleteProducts cron).
 *
 * Extracts Cloudinary public IDs from the stored image URLs and calls
 * the Cloudinary destroy API to free storage space.
 *
 * URL format stored in Firestore:
 *   https://res.cloudinary.com/{cloud}/image/upload/v{version}/{folder}/{file}.{ext}
 * Public ID to pass to Cloudinary:
 *   {folder}/{file}  (no extension, no version prefix)
 */

import { onDocumentDeleted } from "firebase-functions/v2/firestore";
import { createHash } from "crypto";
import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,
} from "./config.js";

/**
 * Extracts the Cloudinary public ID from a full secure_url.
 * Returns null if the URL is not a Cloudinary URL.
 *
 * Example:
 *   input:  "https://res.cloudinary.com/mycloud/image/upload/v1234/aurabuja-app-2026/products/abc.jpg"
 *   output: "aurabuja-app-2026/products/abc"
 */
function extractPublicId(url: string): string | null {
  try {
    const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]{2,5})?$/i);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Deletes an asset from Cloudinary using the signed destroy API.
 * Logs errors but does not throw — a Cloudinary failure should never
 * block or retry the Firestore trigger.
 */
async function destroyCloudinaryAsset(
  publicId: string,
  cloudName: string,
  apiKey: string,
  apiSecret: string,
): Promise<void> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
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

  const json = (await response.json()) as { result?: string };
  if (json.result === "ok" || json.result === "not found") {
    console.log(`[onProductDelete] Cloudinary OK — publicId: ${publicId}, result: ${json.result}`);
  } else {
    console.error(`[onProductDelete] Cloudinary unexpected result for ${publicId}:`, json.result);
  }
}

export const onProductDelete = onDocumentDeleted(
  {
    document: "products/{productId}",
    region: "europe-west1",
    secrets: [CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET],
  },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const images: string[] = Array.isArray(data.images) ? data.images : [];
    if (images.length === 0) {
      console.log(`[onProductDelete] Product ${event.params.productId} had no images — nothing to clean.`);
      return;
    }

    const cloudName = CLOUDINARY_CLOUD_NAME.value();
    const apiKey = CLOUDINARY_API_KEY.value();
    const apiSecret = CLOUDINARY_API_SECRET.value();

    for (const imageUrl of images) {
      const publicId = extractPublicId(imageUrl);
      if (!publicId) {
        console.warn(`[onProductDelete] Could not extract publicId from URL: ${imageUrl}`);
        continue;
      }
      try {
        await destroyCloudinaryAsset(publicId, cloudName, apiKey, apiSecret);
      } catch (err) {
        // Log but continue — never block deletion because of a Cloudinary error
        console.error(`[onProductDelete] Error deleting ${publicId} from Cloudinary:`, err);
      }
    }
  },
);

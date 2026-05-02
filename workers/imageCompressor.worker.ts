/**
 * NUNULIA — Image Compression Web Worker
 *
 * Runs the canvas-based compression off the main thread so adding 5+ photos
 * doesn't freeze the seller dashboard. Worker scope (no DOM, no React).
 *
 * Protocol:
 *   IN:  { id: string, file: File, options?: { maxDimension?: number, quality?: number } }
 *   OUT: { id: string, ok: true,  blob: Blob, type: string }
 *        { id: string, ok: false, error: string }
 *
 * If the input is below the skip threshold OR compression doesn't actually
 * shrink the file, the worker returns the original `file` as `blob` so the
 * caller can still use the response uniformly.
 */

import { compressImageCore, COMPRESSION_DEFAULTS } from '../utils/imageCompressor';

interface CompressRequest {
  id: string;
  file: File;
  options?: { maxDimension?: number; quality?: number };
}

interface CompressResponseSuccess {
  id: string;
  ok: true;
  blob: Blob;
  type: string;
}

interface CompressResponseError {
  id: string;
  ok: false;
  error: string;
}

// Worker context — minimal typing to avoid a project-wide WebWorker lib change.
const ctx = self as unknown as {
  postMessage: (msg: CompressResponseSuccess | CompressResponseError) => void;
  addEventListener: (type: 'message', listener: (e: MessageEvent<CompressRequest>) => void) => void;
};

ctx.addEventListener('message', async (e) => {
  const { id, file, options } = e.data;
  try {
    const compressed = await compressImageCore(file, {
      maxDimension: options?.maxDimension ?? COMPRESSION_DEFAULTS.maxDimension,
      quality:      options?.quality      ?? COMPRESSION_DEFAULTS.quality,
      webpQuality:  COMPRESSION_DEFAULTS.webpQuality,
      skipBelowBytes: COMPRESSION_DEFAULTS.skipBelowBytes,
    });
    // compressImageCore returns null when the file shouldn't change (already small,
    // or compression didn't help). Echo the original so callers don't branch.
    const blob: Blob = compressed ?? file;
    const type = compressed?.type || file.type;
    ctx.postMessage({ id, ok: true, blob, type });
  } catch (err: any) {
    ctx.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
});

export {};

/**
 * NUNULIA — Client-side Image Compression
 *
 * Public API: `compressImages(files, onProgress?)` → `Promise<File[]>`.
 * Compresses each input via a Web Worker so the seller's main thread stays
 * responsive when adding 5+ photos. Falls back to main-thread compression
 * when Workers/OffscreenCanvas are unavailable (jsdom test env, very old
 * browsers).
 *
 * Typical savings: 4 MB phone photo → ~150-250 KB. Critical for IDB storage
 * quotas and 2G/3G upload speeds.
 *
 * Output guarantees:
 *   - Same length and order as input.
 *   - Each output is a `File` (never null).
 *   - Files smaller than `skipBelowBytes` are passed through unchanged.
 *   - On any failure (worker dead, canvas unsupported, encoder error) the
 *     original file is returned — compression is best-effort, never blocking.
 */

export const COMPRESSION_DEFAULTS = {
  /** Pixels — long edge of output image. */
  maxDimension: 1200,
  /** JPEG quality fallback when WebP unsupported. */
  quality: 0.82,
  /** WebP quality (preferred — ~25% smaller than JPEG at the same visual quality). */
  webpQuality: 0.80,
  /** Files below this size are passed through unchanged. */
  skipBelowBytes: 300 * 1024,
} as const;

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
  webpQuality?: number;
  skipBelowBytes?: number;
}

type ResolvedOptions = Required<CompressOptions>;

function resolveOptions(opts?: CompressOptions): ResolvedOptions {
  return {
    maxDimension: opts?.maxDimension ?? COMPRESSION_DEFAULTS.maxDimension,
    quality:      opts?.quality      ?? COMPRESSION_DEFAULTS.quality,
    webpQuality:  opts?.webpQuality  ?? COMPRESSION_DEFAULTS.webpQuality,
    skipBelowBytes: opts?.skipBelowBytes ?? COMPRESSION_DEFAULTS.skipBelowBytes,
  };
}

// ─── Pure compression core ────────────────────────────────────────────────
// Used by both the worker and the main-thread fallback. Returns a smaller
// File, or null if the input should be kept as-is (already small, or
// compression didn't actually shrink it, or the runtime can't compress).

export async function compressImageCore(
  file: File,
  opts: ResolvedOptions,
): Promise<File | null> {
  if (file.size <= opts.skipBelowBytes) return null;
  if (typeof createImageBitmap === 'undefined') return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const ratio = Math.min(
    opts.maxDimension / bitmap.width,
    opts.maxDimension / bitmap.height,
    1,
  );
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  let blob: Blob | null = null;
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext('2d');
      if (!ctx) { bitmap.close(); return null; }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      // Prefer WebP (smaller). Some Safari versions throw on unsupported types
      // → fall back to JPEG.
      blob = await canvas
        .convertToBlob({ type: 'image/webp', quality: opts.webpQuality })
        .catch(() => canvas.convertToBlob({ type: 'image/jpeg', quality: opts.quality }));
    } else if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { bitmap.close(); return null; }
      ctx.drawImage(bitmap, 0, 0, w, h);
      bitmap.close();
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', opts.quality)
      );
    } else {
      bitmap.close();
      return null;
    }
  } catch {
    return null;
  }

  if (!blob || blob.size >= file.size) return null;

  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File(
    [blob],
    file.name.replace(/\.[^.]+$/, `.${ext}`),
    { type: blob.type, lastModified: Date.now() },
  );
}

// ─── Web Worker pool (singleton) ──────────────────────────────────────────

interface PendingEntry {
  resolve: (file: File) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

let _worker: Worker | null = null;
let _workerLoadAttempted = false;
const _pending = new Map<string, PendingEntry>();
const WORKER_TIMEOUT_MS = 30_000;

async function getWorker(): Promise<Worker | null> {
  if (_worker) return _worker;
  if (_workerLoadAttempted) return null;
  _workerLoadAttempted = true;

  if (typeof Worker === 'undefined') return null;

  try {
    // Vite resolves `?worker` to a Worker constructor at build time.
    const mod = await import('../workers/imageCompressor.worker?worker');
    const WorkerCtor = (mod as { default: new () => Worker }).default;
    const w = new WorkerCtor();

    w.addEventListener('message', (e: MessageEvent) => {
      const { id, ok, blob, type, error } = e.data ?? {};
      const cb = _pending.get(id);
      if (!cb) return;
      _pending.delete(id);
      clearTimeout(cb.timer);
      if (!ok) {
        cb.reject(new Error(typeof error === 'string' ? error : 'Worker error'));
        return;
      }
      // Reconstruct as File so callers always receive a File (Workbox/Cloudinary
      // upload expects File for FormData filename support).
      const file = blob instanceof File
        ? blob
        : new File([blob], 'compressed.bin', { type, lastModified: Date.now() });
      cb.resolve(file);
    });

    w.addEventListener('error', (e: Event) => {
      // Worker died — purge pending and force re-attempt on next call. We do
      // NOT clear `_workerLoadAttempted` because a hard crash usually means
      // the runtime will fail again; we let callers fall back to main thread.
      const msg = (e as ErrorEvent)?.message || 'Worker crashed';
      for (const [, cb] of _pending) {
        clearTimeout(cb.timer);
        cb.reject(new Error(msg));
      }
      _pending.clear();
      try { w.terminate(); } catch { /* noop */ }
      _worker = null;
    });

    _worker = w;
    return w;
  } catch {
    return null;
  }
}

async function compressInWorker(file: File, opts: ResolvedOptions): Promise<File> {
  const worker = await getWorker();
  if (!worker) throw new Error('Worker unavailable');

  const id = `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return await new Promise<File>((resolve, reject) => {
    const timer = setTimeout(() => {
      _pending.delete(id);
      reject(new Error('Worker compression timeout'));
    }, WORKER_TIMEOUT_MS);
    _pending.set(id, { resolve, reject, timer });
    worker.postMessage({ id, file, options: opts });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Compress an array of images. Always returns the same length/order as input.
 * Off-main-thread when possible; falls back transparently otherwise.
 */
export async function compressImages(
  files: File[],
  onProgress?: (index: number, total: number) => void,
  options?: CompressOptions,
): Promise<File[]> {
  const opts = resolveOptions(options);
  const results: File[] = [];

  for (let i = 0; i < files.length; i++) {
    onProgress?.(i, files.length);
    const file = files[i];

    if (file.size <= opts.skipBelowBytes) {
      results.push(file);
      continue;
    }

    let out: File | null = null;
    try {
      out = await compressInWorker(file, opts);
    } catch {
      // Worker unavailable or threw — fall back to main thread
      try {
        out = await compressImageCore(file, opts);
      } catch {
        out = null;
      }
    }

    results.push(out ?? file);
  }

  onProgress?.(files.length, files.length);
  return results;
}

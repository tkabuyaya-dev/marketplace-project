/**
 * Compression contract tests.
 *
 * jsdom has no createImageBitmap / OffscreenCanvas / Worker → both the worker
 * path and the main-thread fallback short-circuit and return the original
 * file. These tests lock in the public-API guarantees that hold regardless of
 * runtime support: same length, same order, never null, threshold pass-through.
 */
import { describe, it, expect, vi } from 'vitest';
import { compressImages, COMPRESSION_DEFAULTS } from '../../utils/imageCompressor';

function makeFile(bytes: number, name = 'photo.jpg', type = 'image/jpeg'): File {
  // Pad with the file name so each file is unique even at identical sizes.
  const buf = new Uint8Array(bytes);
  buf.set(new TextEncoder().encode(name).slice(0, Math.min(name.length, bytes)));
  return new File([buf], name, { type, lastModified: Date.now() });
}

describe('compressImages', () => {
  it('returns the same length and order as input', async () => {
    const inputs = [
      makeFile(50_000,    'small-1.jpg'),
      makeFile(2_000_000, 'big-1.jpg'),
      makeFile(50_000,    'small-2.jpg'),
    ];
    const out = await compressImages(inputs);
    expect(out).toHaveLength(3);
    expect(out[0].name).toBe('small-1.jpg');
    expect(out[2].name).toBe('small-2.jpg');
  });

  it('passes through files below the skip threshold unchanged', async () => {
    const small = makeFile(COMPRESSION_DEFAULTS.skipBelowBytes - 1, 'tiny.jpg');
    const out = await compressImages([small]);
    expect(out[0]).toBe(small); // identity — no copy when below threshold
  });

  it('returns a File for every input even when compression cannot run', async () => {
    // jsdom: createImageBitmap is undefined → core returns null → original kept
    const big = makeFile(2_000_000, 'big.jpg');
    const out = await compressImages([big]);
    expect(out[0]).toBeInstanceOf(File);
    expect(out[0].name).toBe('big.jpg');
  });

  it('reports progress for each item plus a final tick', async () => {
    const inputs = [
      makeFile(50_000, 'a.jpg'),
      makeFile(50_000, 'b.jpg'),
    ];
    const onProgress = vi.fn();
    await compressImages(inputs, onProgress);
    // 0/2, 1/2 (per-item), then 2/2 (final)
    expect(onProgress).toHaveBeenCalledWith(0, 2);
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('handles an empty array', async () => {
    const out = await compressImages([]);
    expect(out).toEqual([]);
  });

  it('never throws on empty/error files', async () => {
    const empty = new File([], 'empty.jpg', { type: 'image/jpeg' });
    await expect(compressImages([empty])).resolves.toEqual([empty]);
  });
});

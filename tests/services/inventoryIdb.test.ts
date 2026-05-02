/**
 * inventoryIdb contract tests.
 * Uses fake-indexeddb (already in tests/setup.ts) so writes/reads exercise
 * a real IDB implementation.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getInventoryFromIDB, saveInventoryToIDB } from '../../services/inventoryIdb';
import type { Product } from '../../types';

function makeProduct(id: string, title = `Product ${id}`): Product {
  // Cast through unknown — tests only need a few fields, not the full Product shape.
  return {
    id, title, price: 1000, status: 'approved', sellerId: 'seller-1', images: [],
    description: '', category: '', sellerName: '', createdAt: Date.now(),
  } as unknown as Product;
}

describe('inventoryIdb', () => {
  // fake-indexeddb persists across tests in the same worker — purge between
  // tests to keep them independent.
  beforeEach(async () => {
    // Save an empty array under each user to overwrite any prior data
    await saveInventoryToIDB('user-A', []);
    await saveInventoryToIDB('user-B', []);
  });

  it('returns null when no snapshot has been saved for that user', async () => {
    const out = await getInventoryFromIDB('never-seen-user');
    expect(out).toBeNull();
  });

  it('round-trips a product list', async () => {
    const products = [makeProduct('p1'), makeProduct('p2')];
    await saveInventoryToIDB('user-A', products);
    const snap = await getInventoryFromIDB('user-A');
    expect(snap).not.toBeNull();
    expect(snap!.userId).toBe('user-A');
    expect(snap!.products).toHaveLength(2);
    expect(snap!.products[0].id).toBe('p1');
    expect(typeof snap!.ts).toBe('number');
  });

  it('scopes snapshots per user — A and B do not bleed', async () => {
    await saveInventoryToIDB('user-A', [makeProduct('a1')]);
    await saveInventoryToIDB('user-B', [makeProduct('b1'), makeProduct('b2')]);
    const a = await getInventoryFromIDB('user-A');
    const b = await getInventoryFromIDB('user-B');
    expect(a!.products.map(p => p.id)).toEqual(['a1']);
    expect(b!.products.map(p => p.id)).toEqual(['b1', 'b2']);
  });

  it('overwrites the previous snapshot for the same user', async () => {
    await saveInventoryToIDB('user-A', [makeProduct('old1'), makeProduct('old2')]);
    await saveInventoryToIDB('user-A', [makeProduct('new1')]);
    const snap = await getInventoryFromIDB('user-A');
    expect(snap!.products.map(p => p.id)).toEqual(['new1']);
  });
});

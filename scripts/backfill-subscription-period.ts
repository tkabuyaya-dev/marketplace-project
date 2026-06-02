/**
 * NUNULIA — One-shot backfill : ajoute period='1m' aux subscriptionRequests
 * créées avant le Lot 1 (sans champ `period`).
 *
 * Sans backfill, le code défaute à '1m' partout — fonctionne, mais le champ
 * n'apparaît pas dans Firestore, ce qui complique les filtres admin et le
 * recalcul de montant côté CF approve (P5 du Lot 4).
 *
 * ─── Mode CLI Firebase (pas applicable — Firestore CLI n'a pas d'update batch) ──
 *
 * ─── Mode script TS (recommandé) ────────────────────────────────────────────
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
 *     npx tsx ../scripts/backfill-subscription-period.ts
 *
 * Idempotent : ré-exécutable. Ne touche QUE les docs sans `period`.
 * Sortie : nombre de docs mis à jour + IDs détaillés (loggés).
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('../functions/node_modules/firebase-admin');

const BATCH_SIZE = 400; // Firestore batch limit = 500, on garde une marge

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp(); // utilise GOOGLE_APPLICATION_CREDENTIALS
  }
  const db = admin.firestore();

  console.log('[backfill-period] Lecture subscriptionRequests SANS period…');
  // Firestore ne supporte pas `where('period', '==', null)` directement,
  // on lit tout et on filtre côté code (acceptable pour <10k docs).
  const snap = await db.collection('subscriptionRequests').get();

  const docsToUpdate: any[] = snap.docs.filter((d: any) => {
    const data = d.data();
    return data.period === undefined || data.period === null;
  });

  if (docsToUpdate.length === 0) {
    console.log('[backfill-period] ✓ Aucun document à backfiller. Tout est à jour.');
    return;
  }

  console.log(`[backfill-period] ${docsToUpdate.length} document(s) à backfiller`);

  let updated = 0;
  for (let i = 0; i < docsToUpdate.length; i += BATCH_SIZE) {
    const slice = docsToUpdate.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    slice.forEach((d: any) => {
      batch.update(d.ref, { period: '1m' });
      console.log(`  • ${d.id} (status=${d.data().status})`);
    });
    await batch.commit();
    updated += slice.length;
    console.log(`[backfill-period] Commit ${updated}/${docsToUpdate.length}`);
  }

  console.log(`[backfill-period] ✓ ${updated} document(s) mis à jour avec period='1m'.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill-period] Erreur :', err?.message ?? err);
    process.exit(1);
  });

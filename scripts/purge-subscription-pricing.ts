/**
 * NUNULIA — One-shot purge of subscriptionPricing/* documents
 *
 * À exécuter UNE fois après le déploiement de la refonte tiers (2026-06).
 * Les docs Firestore subscriptionPricing/{countryId} édités par l'admin via
 * la console (Lot 5C) utilisent les anciennes clés (starter/pro/elite/unlimited)
 * et écraseraient les nouveaux defaults `DEFAULT_SUBSCRIPTION_PRICING` (vendeur/
 * pro/grossiste). On les purge pour que les nouveaux defaults prennent effet.
 *
 * ─── Mode CLI Firebase (recommandé, plus simple) ────────────────────────────
 *   firebase firestore:delete subscriptionPricing --recursive --yes
 *
 * ─── Mode script TS (équivalent, contrôle plus fin) ─────────────────────────
 *   cd functions
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json \
 *     npx tsx ../scripts/purge-subscription-pricing.ts
 *
 * Le script utilise firebase-admin installé dans /functions. Aucun nouveau
 * dépendency au niveau root. Idempotent : ré-exécutable sans effet de bord.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const admin = require('../functions/node_modules/firebase-admin');

async function main() {
  if (admin.apps.length === 0) {
    admin.initializeApp(); // utilise GOOGLE_APPLICATION_CREDENTIALS
  }
  const db = admin.firestore();

  console.log('[purge-subscription-pricing] Lecture de subscriptionPricing/*…');
  const snap = await db.collection('subscriptionPricing').get();

  if (snap.empty) {
    console.log('[purge-subscription-pricing] Aucun document à supprimer. Rien à faire.');
    return;
  }

  console.log(`[purge-subscription-pricing] ${snap.size} document(s) à supprimer :`);
  for (const doc of snap.docs) {
    console.log(`  • subscriptionPricing/${doc.id}`);
  }

  const batch = db.batch();
  snap.docs.forEach((d: { ref: any }) => batch.delete(d.ref));
  await batch.commit();

  console.log(`[purge-subscription-pricing] ✓ ${snap.size} document(s) supprimé(s).`);
  console.log('[purge-subscription-pricing] Les nouveaux defaults DEFAULT_SUBSCRIPTION_PRICING');
  console.log('[purge-subscription-pricing] (constants.ts) sont maintenant la source unique.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[purge-subscription-pricing] Erreur :', err?.message ?? err);
    process.exit(1);
  });

#!/usr/bin/env node
/**
 * NUNULIA — i18n parity check (FR ↔ EN)
 *
 * Compare les paths de toutes les clés entre `locales/fr/common.json` et
 * `locales/en/common.json`. Exit code 0 si parité 100 %, exit 1 sinon
 * (avec la liste des clés manquantes côté FR ou EN).
 *
 * Pas intégré CI dans Phase 8 — script à lancer à la main via :
 *   npm run i18n:check
 *
 * Phase 9+ : intégration via husky pre-commit ou GitHub Action.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const LOCALES = [
  { lang: 'fr', path: resolve(ROOT, 'locales/fr/common.json') },
  { lang: 'en', path: resolve(ROOT, 'locales/en/common.json') },
];

function collectPaths(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      collectPaths(v, path, out);
    } else {
      out.push(path);
    }
  }
  return out;
}

function loadKeys(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const json = JSON.parse(raw);
  return new Set(collectPaths(json));
}

const [fr, en] = LOCALES.map((l) => loadKeys(l.path));

const missingInEn = [...fr].filter((k) => !en.has(k)).sort();
const missingInFr = [...en].filter((k) => !fr.has(k)).sort();

if (missingInEn.length === 0 && missingInFr.length === 0) {
  console.log(`✅ i18n parity OK (${fr.size} clés FR ↔ ${en.size} clés EN)`);
  process.exit(0);
}

console.error(`❌ i18n parity failure (FR=${fr.size}, EN=${en.size})`);
if (missingInEn.length) {
  console.error(`\n⚠ ${missingInEn.length} clé(s) manquante(s) côté EN :`);
  for (const k of missingInEn) console.error(`  - ${k}`);
}
if (missingInFr.length) {
  console.error(`\n⚠ ${missingInFr.length} clé(s) manquante(s) côté FR :`);
  for (const k of missingInFr) console.error(`  - ${k}`);
}
process.exit(1);

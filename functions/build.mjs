import { build } from "esbuild";

/**
 * AURABUJA — Cloud Functions Build Script
 *
 * Bundles firebase-functions INTO the output (not external) to avoid
 * Node 24's slow module resolution for large packages.
 *
 * firebase-admin remains external — the lazy proxy in lib/bootstrap.js
 * (the package.json "main" entry) intercepts all firebase-admin requires
 * and defers loading until runtime.
 */

const result = await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  outfile: "lib/index.js",
  format: "cjs",
  sourcemap: true,
  external: [
    "firebase-admin",
    "firebase-admin/*",
    // firebase-functions is BUNDLED (not external) to avoid Node 22's
    // slow module resolution exceeding Firebase CLI's 10s discovery timeout
    "algoliasearch",
    "ioredis",
  ],
});

if (result.errors.length > 0) {
  process.exit(1);
}

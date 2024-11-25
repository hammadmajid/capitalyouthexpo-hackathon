import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// MapLibre 6 resolves its worker beside the bundled chunk, which Next does not emit; serve the
// exact package worker from our own origin so CSP worker-src 'self' still applies.
export async function vendorMapWorker() {
  const source = require.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs');
  const target = new URL('../public/vendor/', import.meta.url);
  await mkdir(target, { recursive: true });
  await copyFile(source, new URL('maplibre-gl-worker.mjs', target));
}

// Self-hosted MapLibre worker (copied at build/dev); see scripts/maplibre-worker.mjs.
export const mapWorkerUrl = '/vendor/maplibre-gl-worker.mjs';
export async function loadMapLibre() {
  const runtime = await import('maplibre-gl');
  runtime.setWorkerUrl(mapWorkerUrl);
  return runtime;
}

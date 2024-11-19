import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// SEC-001: exercise the exact dependencies consumed by Expo, not separate test copies.
const mobile = createRequire(
  fileURLToPath(new URL('../../apps/mobile/package.json', import.meta.url)),
);
export const expo = createRequire(mobile.resolve('expo/package.json'));
export const cli = createRequire(expo.resolve('@expo/cli/package.json'));
export const metro = createRequire(expo.resolve('@expo/metro/package.json'));
export const fileMap = createRequire(metro.resolve('metro-file-map/package.json'));
export const micromatch = createRequire(fileMap.resolve('micromatch/package.json'));
export const braceRequire = createRequire(micromatch.resolve('braces/package.json'));

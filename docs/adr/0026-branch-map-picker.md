# ADR 0026: Branch pin selection with MapLibre and OpenFreeMap

- **Status:** Accepted; verification in progress
- **Date:** 2026-10-12
- **Requirements:** ONB-001, CHG-006, SEC-001, SEC-003; Q8

## Context

Revised Phase 1 requires a visual main-branch pin picker. The user delegated the
provider/budget decision. It must work without paid credentials in either client,
retain private drafts and support manual coordinates when tiles are unavailable.

## Decision

Use MapLibre GL JS on web and MapLibre React Native on Android with the fixed
OpenFreeMap Liberty style. OpenFreeMap permits commercial use without an API key
or required usage fee. Its public service has no SLA; this is not a paid-service
commitment. Keep OpenFreeMap, OpenMapTiles and OpenStreetMap attribution visible.
No geocoding or device-location tracking is introduced. Opening the picker is an
explicit action with a notice that it contacts OpenFreeMap. No account, credentials,
address text, document references or authentication data is added to tile requests.
The provider receives the client IP address and tile coordinates for the viewed
map area, including the area around an existing branch pin when opened.

Only explicit pin confirmation updates the form. The default Islamabad viewport
is not an implicit saved coordinate. Preserve manual entry, all other draft values,
cancellation and load-failure recovery. Existing API validation, authorization,
transactions and private submission behavior remain authoritative.

The web Owner page alone permits the fixed tile origin and MapLibre blob worker
through CSP. Script, object, framing and geolocation restrictions remain enforced.
The real browser runner selects the documented SwANGLE OpenGL ES driver for
GPU-less CI, rather than enabling the deprecated unsafe WebGL fallback. The
production browser settings and CSP are unchanged by this test renderer choice.
The Expo config includes the MapLibre native plugin; a fresh native build is
required. Expo Go is not the acceptance environment. Existing Android CI builds
both emulator and Pixel architectures and runs the installed application.

## Consequences

Unit/component tests exercise coordinate validation, explicit confirmation,
cancellation and failure. Real browser and installed-Android scenarios exercise
pin selection, persisted drafts and submission without bypassing the actual API.
Provider tile availability is external; manual entry remains useful during outages.
Real browser/native acceptance is pending until exact-commit CI succeeds. No local
container or installed-native PASS follows from configuration or a JS export.

## Sources

- [OpenFreeMap policy and attribution](https://openfreemap.org/)
- [OpenFreeMap style setup](https://openfreemap.org/quick_start/)
- [MapLibre native requirements](https://maplibre.org/maplibre-react-native/docs/setup/getting-started/)
- [MapLibre Expo plugin](https://maplibre.org/maplibre-react-native/docs/setup/expo/)
- [Chromium renderer modes for GPU-less bots](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)

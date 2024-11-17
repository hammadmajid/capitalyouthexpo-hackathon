# HSM mobile foundation

Expo SDK 57 / React Native / Router / NativeWind. Android first. The shared HSM
contracts, generated API client and tokens define the client boundaries and style.
No marketplace, resident-domain or onboarding workflows are implemented here.

## Windows development without Docker

Use Corepack-pinned pnpm. Copy the root `.env.example` to `.env` and configure
`EXPO_PUBLIC_APP_ENV` and an API root origin, without `/v1`. All public environment
values enter the bundle: never add credentials or private keys. A physical device
needs an API origin it can reach; localhost is the device itself. Deployed builds
require HTTPS. Development/test Android builds alone permit cleartext HTTP.

- Install: `pnpm install --frozen-lockfile`.
- Local checks: `pnpm turbo run lint typecheck test test:components build --filter=@hsm/mobile --concurrency=1`.
- Development: `pnpm turbo run dev --filter=@hsm/mobile` with an Expo-compatible
  device/runtime. No Docker is needed to compile or develop the application.
- Native generation: `pnpm turbo run android:prepare --filter=@hsm/mobile`.
  Android project output is generated and ignored. SDK/JDK are separate native
  tooling prerequisites; a Metro export does not prove an APK/device build.

## Real native integration

`pnpm turbo run test:native --filter=@hsm/mobile --concurrency=1` requires an
installed Maestro CLI, running Android device/emulator, the generated bundled APK
and a working Docker-compatible runtime. CI builds that APK with Gradle, installs
pinned Maestro and supplies the emulator. ADB reverse links the device's public
loopback API origin to the actual fresh Testcontainers API port. The worker sends
real OTP mail through Mailpit; codes never enter source or emitted command output.
The native flows assert persisted PostgreSQL session state and revocation.

Only sanitized JUnit results are published. Raw native diagnostics are excluded
from Git and CI artifacts. Existing backend integration suites remain required.
No device/API/container success is claimed until the required CI run succeeds.

## Transport and dependency verification

HTTP timeouts use AbortController plus a cleared timer, compatible with React
Native's actual abort-controller polyfill. Caller cancellation is preserved.
Run `pnpm turbo run security:audit --filter=@hsm/config` for real registry scanning
and backport integrity/canaries. Two exact tooling findings have maintained,
tested patches and temporary exceptions expiring 2026-11-08 UTC. They remain
visible in full reports; every other high/critical finding blocks. See
[the audit record](../../docs/mobile-dependency-audit.md).

Native failures retain only closed command identifiers, positions and UI-state
names. The harness obtains bounded private UI XML only during an explicitly
running native integration flow, deletes the temporary device file in finally,
and never publishes raw text, hierarchy or screenshots. This diagnostic does
not replace any test assertion or change the existing deadlines.

## Private error telemetry

Optional EXPO_PUBLIC_SENTRY_DSN enables lazy JavaScript SDK reporting. Only fixed
service/environment/error markers leave the final envelope; native crash, replay,
tracing, screenshots, documents, breadcrumbs and automatic integrations are disabled.
The root error boundary and font failures report without raw errors or credentials.
Collector failures cannot interrupt authentication. Hosted receipt is unverified.
SDK tests use real HTTP with a real Node fetch adapter for the Jest platform; no
infrastructure test is replaced. Sentry CLI install scripts remain unapproved:
source uploads are disabled and no upload token is configured.

Invalid optional mobile telemetry configuration disables reporting before SDK
loading, preserving application startup. Real HTTP tests also cover direct event
submission and require exact closed envelope headers and payloads. Component
coverage gates measure the SDK and root boundary separately from policy/runtime
coverage; these scoped reports do not establish whole-application coverage.

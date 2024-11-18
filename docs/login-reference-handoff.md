# M-05 reference login: audit and handoff (2026-10-14)

Visual instructions in this historical handoff are superseded by the user's
2026-10-28 Nature Glass reference: remove Welcome Back and its subtitle, use the
glass card and centered controls, and keep Sign In solid emerald per follow-up.
Current implementation and actual Pixel evidence are in
[the new report](hsm-login-nature-glass-implementation.md). Historical evidence below
is retained; it is not current device acceptance.

Refs: AUTH-C, AUTH-M-005, SEC-001, SEC-003, CHG-006.

## A. Pre-change audit

Repository E:/hsm-git; branch feature/phase-1a-foundation;
HEAD cbd9a66ff090c22b38d2f6069e5608f8bcc69e57. Tracked tree clean before
editing; unrelated untracked integration-failure.txt preserved without access.
Tracked text scan found no NUL indicators. No initial migration, generated client,
lockfile or Android drift. No suitable existing logo/landscape assets found.

Login: src/app/index.tsx and auth/[flow].tsx -> AuthFlow/CredentialFlow ->
LoginScreen/FlowForm -> runAuth -> POST /v1/auth/login. The strict shared loginSchema
accepts identifier/password/client. Shared normalizeLoginIdentifier and
pakistaniMobileSchema in packages/contracts/src/phone.ts handle Pakistani formats.
No backend change is required. Existing safeMessage sanitizes API failures.

Successful login calls session.establish, MobileSessionManager.establish,
CredentialVault.save, then fresh GET /v1/me and router.replace('/account').
Account uses live canEnter/capabilities for Customer/Owner/Manager/Admin.
Root Stack.Protected excludes private routes for guests. Restoration serializes
GET /me and refresh rotation; terminal rejection clears stored credentials.
SecureStore uses WHEN_UNLOCKED_THIS_DEVICE_ONLY and pk.hsm.session.
Providers clear queries on identity/session transitions; telemetry is privacy-safe.

Tests inspected: auth.spec.ts, session.spec.ts, session-state.spec.ts,
vault.spec.ts, providers.component.spec.tsx, login-screen.component.spec.tsx,
registration-flow.component.spec.tsx and original Maestro login/registration flows.
FlowForm has loading/error states but no synchronous double-tap lock.
Lucide and react-native-svg already exist; Plus Jakarta Sans regular/bold loaded.
SafeAreaView, KeyboardAvoidingView and ScrollView are existing preferred patterns.

## Presentation decisions before implementation

User reference supersedes M-05 presentation only. Introduce scoped login tokens
through @hsm/ui; do not change existing global colors. Original vector artwork
will use installed react-native-svg, not screenshot crops or remote images.

Remember me is omitted: sessions already persist automatically and no optional
persistence contract exists. A checkbox would imply a false or newly invented
security setting. SecureStore behavior remains unchanged. Guest access, email
verification and invited-Manager activation are required existing routes (mobile
screen inventory M-02/M-05); preserve them as quiet text links. Recovery remains
email-only. The explicit prompt requires three fields even though the illustration
shows one combined identifier field. Neither phone OTP nor a role selector is added.

Minimum implementation: login screen/form/fields/vector artwork, a small validated
identifier adapter, scoped tokens, focused tests, intentional Maestro selectors,
and status/design/screen documentation. No dependency or native generation needed.

## B. Implementation

The latest user image supersedes the original separate-field/no-toggle brief.
M-05 uses Email/Phone tabs, one active identifier and Password, centered HSM
house/bed branding, Welcome Back, original sage/cream/campus vectors, rounded
inputs and green pill Sign In. Verify email is removed from Login only.
Tab changes clear identifiers/errors, retain Password and are disabled while
submitting. Recovery and Sign up use the original flows. Required Guest/Manager
entry remains. No role/CNIC/social selector or Sign In arrow.

## C. Files

Modified (repository-relative):

- apps/mobile/src/components/auth-flow.tsx
- apps/mobile/src/components/login-screen.tsx
- apps/mobile/src/components/login-screen.component.spec.tsx
- apps/mobile/src/lib/auth.spec.ts
- apps/mobile/e2e/logged-out.yaml
- apps/mobile/e2e/login.yaml
- apps/mobile/e2e/logout-all.yaml
- apps/mobile/e2e/logout.yaml
- apps/mobile/e2e/owner-setup.yaml
- apps/mobile/e2e/register.yaml
- apps/mobile/e2e/revoked.yaml
- packages/ui/src/index.ts
- packages/ui/src/tokens.spec.ts
- docs/STATUS.md
- docs/09-design-system.md
- docs/screens/mobile.md

Created:

- apps/mobile/src/components/login-artwork.tsx
- apps/mobile/src/components/login-field.tsx
- apps/mobile/src/components/login-form.tsx
- apps/mobile/src/components/login-mode.tsx
- apps/mobile/src/components/use-login-form.ts
- apps/mobile/src/lib/login-input.ts
- apps/mobile/src/lib/login-input.spec.ts
- packages/ui/src/login-tokens.ts
- docs/login-reference-handoff.md

Deleted: NONE. Ignored task logs/desktop previews remain in .tools.

## D. Assets

Original local react-native-svg house/bed logo, sage/cream curves and campus
landscape in login-artwork.tsx. Pale hills, small hostel buildings, clouds and muted
trees remain decorative. No screenshot crops, remote/stock assets, rasterized
screen or image-generation dependency. Existing Lucide handles control icons.

## E. Login behavior

Email: trim/validate/normalize through existing normalizeLoginIdentifier. Phone:
03001234567, 923001234567 and +923001234567 use existing pakistaniMobileSchema,
producing canonical +923001234567. Selected mode shows one field and clears its
inactive counterpart. The adapter still rejects both identifiers if ever supplied.
Neither/invalid identifier and missing/invalid Password show inline errors.
No password trimming. Transport remains identifier/password/client: mobile.
Password stays secure by default with accessible Show/Hide password.

## F. Session/security

SecureStore, vault, restoration/rotation, fresh GET /me, capability routing,
revocation, telemetry, API contract and backend: UNCHANGED. Original safeMessage
sanitizes backend/network failures. Synchronous lock prevents duplicate requests;
mounted checks discard late UI writes. Existing request timeout/cancellation stays.
No fake Remember me: sessions already persist automatically with device-only
SecureStore. No new credential logging or storage. No phone OTP.

## G. Responsive UI

Width bounded at 440; flex layout, safe areas, KeyboardAvoidingView, ScrollView,
usable control minimum heights and wrapping actions. Illustration can move below
the fold. Desktop adapter previews at 412x892 and 360x740 are layout aids only,
not native screenshots. Pixel/keyboard/200% font acceptance remains manual.

## H. Accessibility

Named inputs, email/phone keyboards and autocomplete, capitalization/correction
off, secure Password, Show/Hide labels, selected/disabled tabs, busy/disabled Sign In,
alert/live-region errors and 48-point secondary targets. Artwork hidden from
accessibility/pointer events. Six new unrounded AA 4.5 text contrast checks.

## I. Test changes

- login-screen.component.spec.tsx: retained navigation/session notice/submission;
  selected tabs, inactive clearing, canonical phone calls, inline errors, visibility,
  loading lock, semantics and sanitized failure. Verify-email Login assertion now
  checks absence at user's request; staged registration OTP suites are retained.
- login-input.spec.ts: email, three phone formats, both/neither identifiers,
  invalid formats and shared Password contract.
- auth.spec.ts: three real typed-client unit transport checks for phone identifiers.
- tokens.spec.ts: six reference-palette contrast pairs.
- Seven Maestro files: intentional labels/selectors only; scenarios, assertions and
  deadlines retained. Native scenarios NOT RUN here.

## J. Local verification

Final working-tree results:

| Label      | Command/check                                                                                                                      | Exit/result                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| LOCAL PASS | `pnpm turbo run lint typecheck test test:components --filter=@hsm/mobile --filter=@hsm/contracts --filter=@hsm/ui --concurrency=1` | 0; 36 tasks, 32 cached/four fresh; 212 mobile unit + 95 component + 176 contract + 13 token cases |
| LOCAL PASS | `pnpm turbo run build --filter=@hsm/mobile --only -- --max-workers 1`                                                              | 0; one fresh task, 3m 9s, 8.2 MB Android/Hermes export; dependencies already built                |
| LOCAL PASS | `pnpm exec prettier --check` over all 25 changed/created files                                                                     | 0; formatting                                                                                     |
| LOCAL PASS | `git diff --check`                                                                                                                 | 0                                                                                                 |
| LOCAL PASS | `gitleaks stdin --redact --no-banner` over tracked diff plus nine created files                                                    | 0; no leaks                                                                                       |
| LOCAL PASS | targeted drift, UTF-8/NUL and size checks                                                                                          | 0; seven native scenarios preserve behavior/deadlines; no unexpected drift                        |
| LOCAL PASS | desktop adapter preview renderer                                                                                                   | 0; reviewed 412x892 and 360x740; not native acceptance                                            |
| NOT RUN    | Gradle APK build, signature/manifest/native APK checks, adb/device/API acceptance                                                  | Manual follow-up only                                                                             |
| NOT RUN    | real containers/Testcontainers/browser/native integration and exact-revision CI                                                    | Remain mandatory; no CI PASS claimed                                                              |
| PENDING    | Pixel keyboard, 200% text and live API acceptance                                                                                  | Follow manual steps below                                                                         |

496 cases across these local suites; shared results reused by Turbo where inputs
match. Mobile scoped coverage: 100% lines/functions, 99.62% branches. New adapter
100% throughout. SDK/boundary component coverage: 100% lines/branches and 84.61%
functions; original 90/85/80 gates pass. This is not aggregate whole-app coverage.
LOCAL FAIL: pre-change regression exit 1, five passed/two failed (new fields absent,
existing cold-start timeout). Scoped telemetry coverage also failed because its
suites were omitted. No gate/timeout was changed. LOCAL FAIL: intermediate form
edit formatting error corrected; later formatting passed. NOT RUN: earlier full
invocation interrupted after user direction superseded its source. No pass claimed.
Additional LOCAL FAIL checkpoints: initial full checks exited 2 on strict error-prop
and mock-return typing; corrected without compiler relaxation. Next run exited 1
on a test fixture's attempt to call a host-node handler; corrected through actual
user events and a separate hook test proving two calls before re-render. All
final assertions pass, with no overlapping act warning. Original failed logs retained.

## K. Dependencies

Added NONE; removed NONE; lockfile impact NONE. Installed SVG, Lucide, fonts,
React Native/Expo reused. Android project/configuration not regenerated.

## L. Git diff

Branch feature/phase-1a-foundation; HEAD cbd9a66ff090c22b38d2f6069e5608f8bcc69e57.
16 tracked files modified, nine files created, zero deleted. The unrelated untracked
integration-failure.txt remains untouched and outside every content scan.
Unexpected backend/database/client/lockfile/Android/CI drift: NO. Same branch/HEAD. No automatic commit,
push, merge, stash, destructive Git operation or history rewrite. Working-tree
changes remain visible per the task-specific user prompt.

Captured `git status --short`:

```text
 M apps/mobile/e2e/logged-out.yaml
 M apps/mobile/e2e/login.yaml
 M apps/mobile/e2e/logout-all.yaml
 M apps/mobile/e2e/logout.yaml
 M apps/mobile/e2e/owner-setup.yaml
 M apps/mobile/e2e/register.yaml
 M apps/mobile/e2e/revoked.yaml
 M apps/mobile/src/components/auth-flow.tsx
 M apps/mobile/src/components/login-screen.component.spec.tsx
 M apps/mobile/src/components/login-screen.tsx
 M apps/mobile/src/lib/auth.spec.ts
 M docs/09-design-system.md
 M docs/STATUS.md
 M docs/screens/mobile.md
 M packages/ui/src/index.ts
 M packages/ui/src/tokens.spec.ts
?? apps/mobile/src/components/login-artwork.tsx
?? apps/mobile/src/components/login-field.tsx
?? apps/mobile/src/components/login-form.tsx
?? apps/mobile/src/components/login-mode.tsx
?? apps/mobile/src/components/use-login-form.ts
?? apps/mobile/src/lib/login-input.spec.ts
?? apps/mobile/src/lib/login-input.ts
?? docs/login-reference-handoff.md
?? integration-failure.txt
?? packages/ui/src/login-tokens.ts
```

Captured tracked `git diff --stat` (created files listed in C are untracked and excluded):

```text
 apps/mobile/e2e/logged-out.yaml                    |   2 +-
 apps/mobile/e2e/login.yaml                         |   4 +-
 apps/mobile/e2e/logout-all.yaml                    |   2 +-
 apps/mobile/e2e/logout.yaml                        |   2 +-
 apps/mobile/e2e/owner-setup.yaml                   |   4 +-
 apps/mobile/e2e/register.yaml                      |   6 +-
 apps/mobile/e2e/revoked.yaml                       |   4 +-
 apps/mobile/src/components/auth-flow.tsx           |  22 +--
 .../src/components/login-screen.component.spec.tsx | 186 ++++++++++++++++++++-
 apps/mobile/src/components/login-screen.tsx        | 155 +++++++++--------
 apps/mobile/src/lib/auth.spec.ts                   |  19 +++
 docs/09-design-system.md                           |  25 +++
 docs/STATUS.md                                     |  35 +++-
 docs/screens/mobile.md                             |  25 +++
 packages/ui/src/index.ts                           |   1 +
 packages/ui/src/tokens.spec.ts                     |  13 ++
 16 files changed, 403 insertions(+), 102 deletions(-)
```

## M. Remaining risks

Desktop previews/unit/component checks do not establish native/API acceptance.
Final APK needs a reachable real API. Prior Phase 1 browser/native failures, hosted
telemetry receipt, CI availability and administrator protection verification stay
open. This change does not close Phase 1 or alter security exceptions.

## N. PowerShell handoff — manual only

No APK build/inspection/install commands below were executed by Codex. Reuse the
existing Android project; do not run clean/prebuild or upgrade dependencies.

### 1. Verify repository and choose API

```powershell
$repo = 'E:\hsm-git'
Set-Location $repo
$env:PATH = "$repo\.tools\node-v24.21.0-win-x64;D:\Git\bin;" + $env:PATH
git branch --show-current
git rev-parse HEAD
git status --short
git diff --check
pnpm turbo run lint typecheck test test:components --filter=@hsm/mobile --filter=@hsm/contracts --filter=@hsm/ui --concurrency=1
$env:EXPO_PUBLIC_API_URL = Read-Host 'Reachable development API origin (prefer HTTPS; no credentials)'
$env:EXPO_PUBLIC_APP_ENV = 'test'
$env:EXPO_PUBLIC_SENTRY_DSN = ''
$env:EXPO_NO_TELEMETRY = '1'
```

Use a real API/database/container environment. Windows currently has no Docker.
Localhost requires an actual API listening on this computer plus adb reverse.

### 2. Build arm64 release APK

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\openjdk\jdk-21.0.8'
$env:ANDROID_HOME = 'C:\Users\dell\AppData\Local\Android\sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:GRADLE_USER_HOME = 'D:\GradleUserHome'
$env:NODE_OPTIONS = '--max-old-space-size=1536'
$env:CMAKE_BUILD_PARALLEL_LEVEL = '1'
Push-Location "$repo\apps\mobile\android"
try {
  & .\gradlew.bat :app:assembleRelease --init-script ../scripts/android-short-paths.gradle -PreactNativeArchitectures=arm64-v8a -Pkotlin.compiler.execution.strategy=in-process '-Dorg.gradle.jvmargs=-Xmx1536m' --max-workers=1 --build-cache --no-daemon *> "$repo\.tools\login-reference-manual-apk.log"
  if ($LASTEXITCODE -ne 0) { throw 'APK build failed; inspect the preserved log' }
} finally { Pop-Location }
$apk = "$repo\apps\mobile\android\app\build\outputs\apk\release\app-release.apk"
Get-Item -LiteralPath $apk
Get-FileHash -LiteralPath $apk -Algorithm SHA256
```

### 3–5. Manifest, libraries, alignment/signature

```powershell
$bt = "$env:ANDROID_HOME\build-tools\36.0.0"
& "$bt\aapt2.exe" dump badging $apk
$permissions = & "$bt\aapt2.exe" dump permissions $apk
$permissions
if ($permissions -match 'ACCESS_(COARSE|FINE|BACKGROUND)_LOCATION') { throw 'Unexpected GPS permission' }
& "$bt\zipalign.exe" -c -P 16 -v 4 $apk
if ($LASTEXITCODE -ne 0) { throw 'APK ZIP alignment failed' }
& "$bt\apksigner.bat" verify --verbose $apk
if ($LASTEXITCODE -ne 0) { throw 'APK signature failed' }
@'
import struct, zipfile
from pathlib import Path
apk = Path('apps/mobile/android/app/build/outputs/apk/release/app-release.apk')
with zipfile.ZipFile(apk) as archive:
    names = archive.namelist()
    libs = [n for n in names if n.startswith('lib/') and n.endswith('.so')]
    assert libs and all(n.startswith('lib/arm64-v8a/') for n in libs)
    assert 'lib/arm64-v8a/libhermesvm.so' in names
    assert 'lib/arm64-v8a/libmaplibre.so' in names
    for name in libs:
        data = archive.read(name)
        assert data[:6] == b'\x7fELF\x02\x01'
        assert struct.unpack_from('<H', data, 18)[0] == 183
        offset = struct.unpack_from('<Q', data, 32)[0]
        size, count = struct.unpack_from('<HH', data, 54)
        for index in range(count):
            entry = offset + index * size
            if struct.unpack_from('<I', data, entry)[0] == 1:
                file_offset, address = struct.unpack_from('<QQ', data, entry + 8)
                alignment = struct.unpack_from('<Q', data, entry + 48)[0]
                assert alignment >= 16384 and (address - file_offset) % 16384 == 0
print('Verified arm64 libraries and 16 KB ELF alignment:', len(libs))
'@ | python -
if ($LASTEXITCODE -ne 0) { throw 'Native library verification failed' }
```

Confirm pk.hsm.app, expected SDK/version and fresh build timestamp. This is a
manual development APK check, not production signing acceptance.

### 6–8. Install, launch and inspect

```powershell
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
& $adb devices -l
$device = '1C151FDEE009XE' # Confirm authorized connected Pixel identity.
& $adb -s $device shell getprop ro.product.model
# Only for a real API listening locally on port 4000:
# & $adb -s $device reverse tcp:4000 tcp:4000
& $adb -s $device install -r $apk
if ($LASTEXITCODE -ne 0) { throw 'Installation failed' }
& $adb -s $device shell am start -n pk.hsm.app/.MainActivity
```

Inspect logo/curves/campus, selected tabs, one identifier, Password visibility,
absence of Verify email, recovery, Sign In and Sign up. Check keyboard and 200%
font scaling with all controls reachable. No misleading persistence checkbox.

### 9–14. API flows, screenshot and final gates

With authorized test accounts against the real API, test Email/password and each
phone format/password; invalid details; duplicate taps; network failure; suspended/
revoked identity; relaunch restoration and logout. Mode switching must not send
both identifiers. Forgot password remains email reset. Sign up remains
email -> OTP -> permanent password -> profile. Guest/Manager entry stays available.

Capture an empty public login after clearing test credentials:

```powershell
& $adb -s $device shell screencap -p /sdcard/hsm-login-reference.png
& $adb -s $device pull /sdcard/hsm-login-reference.png "$repo\.tools\hsm-login-reference-pixel.png"
```

Record APK hash, installation and device/API evidence separately. In compatible CI
run the existing infrastructure, transactional, browser and native gates from
ci-verification.md. Claim CI PASS only after final-revision success. Review the
working tree; this task does not authorize automatic commit/push.

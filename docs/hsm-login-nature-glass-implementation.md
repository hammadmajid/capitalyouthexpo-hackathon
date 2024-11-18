# HSM M-05 Nature Glass implementation and device validation

Date: 2026-10-28. Refs: AUTH-C, AUTH-M-005, CHG-006, SEC-001/003.

## Code inspection and scope

Inspected LoginScreen, LoginForm, LoginModePicker, LoginField, original SVG artwork,
useLoginForm, AuthFlow, prepareLogin, runAuth, session/provider restoration,
SecureStore configuration, navigation protection, scoped tokens and existing tests.
Login already adapts exactly one Email/Phone identifier to the shared normalized
password-login contract. The hook owns validation, synchronous duplicate-submit
locking, loading and sanitized failures. AuthFlow owns capability-based routing.
All these mechanisms remain intact.

The older handoff included Welcome Back and quieter adjacent guest/Manager links.
The new user reference expressly supersedes those visuals. User follow-ups require
a solid emerald Sign In button and centered content inside cards/controls.
No native blur package is installed; layered SVG/translucent native surfaces were
used without adding dependencies or expensive full-screen blur.

## Implementation and exact files

| File                                                                                    | Presentation change                                                                                                                                                         |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/mobile/src/components/login-screen.tsx`                                           | Stacked house/bed, HSM and HOSTEL MARKETPLACE; immediate glass card, separate divider/guest/Manager actions; safe-area keyboard-aware scroll; centered control content      |
| `apps/mobile/src/components/login-artwork.tsx`                                          | Original local mint/sage background, curved cream ribbon, botanical leaves, glass reflections, simple hills/buildings/trees; noninteractive and hidden from accessibility   |
| `apps/mobile/src/components/login-mode.tsx`                                             | Raised white selected tab and centered icon/label groups; existing mode handlers retained                                                                                   |
| `apps/mobile/src/components/login-field.tsx`                                            | Translucent rounded fields, exact email placeholder, green lock/mail/phone/visibility icons, vertical text centering; existing values/errors/keyboard/autocomplete retained |
| `apps/mobile/src/components/login-form.tsx`                                             | Solid emerald Sign In with centered label and right arrow; recovery right-aligned; centered signup grouping; existing handlers retained                                     |
| `apps/mobile/src/components/login-screen.component.spec.tsx`                            | Replaces superseded Welcome Back assertion with approved branding/divider/placeholder checks; existing functional assertions retained                                       |
| `packages/ui/src/login-tokens.ts`                                                       | Adds isolated Nature Glass colors/metrics; preserves original palette because marketplace inherits it                                                                       |
| `packages/ui/src/tokens.spec.ts`                                                        | Adds normal-text contrast checks for Nature Glass pairs; existing marketplace checks preserved                                                                              |
| `docs/09-design-system.md`, `docs/screens/mobile.md`, `docs/login-reference-handoff.md` | Records current reference and marks historical visual requirements superseded                                                                                               |
| `docs/STATUS.md`, this report                                                           | Evidence and limitations                                                                                                                                                    |

No change to authentication endpoints/controllers, validation/normalization logic,
JWT/session handling, providers, SecureStore, database schema/migrations, roles,
permissions, Home, booking, inventory, rent, `.env` or `.env.worker`.
Unrelated concurrent backend/reporting/Web work is preserved.

## Device and source

Pixel 6 Pro (`Pixel_6_Pro`), application `pk.hsm.app`. Existing reverse forwards:
4000 to API, 8081 to Metro. Physical display 1440×3120, existing density override
476, original font scale 1.0. Native safe areas/status/navigation are preserved;
the iPhone frame/Dynamic Island in the reference are not drawn inside HSM.

Installed app was a release build with embedded JavaScript. Installed the existing
compatible debug APK using `adb install -r`, preserving application data and ID,
to load updated source from Metro. No uninstall, data clearing, clean/prebuild,
dependency upgrade or native source change occurred. Metro confirmed successful
Android bundling (4287 modules). Real screens and interactive route changes verify
the implementation is not a screenshot overlay.

## Visual iterations

All raw captures below are from `adb shell screencap`, under
`D:/hsm/.tools/login-visual-qa/`; they are not generated UI previews.

| Capture                           | Findings and response                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `iteration-00-installed.png`      | Baseline release: Welcome Back, missing glass, collapsed tabs and invisible primary button, adjacent guest/Manager links. Replaced presentation with live reference layout |
| `iteration-01.png`                | Debug launch had not rendered after Metro resolved temporarily absent files during patching. Blank capture is retained as failed evidence, not acceptance                  |
| `iteration-02.png`                | Nature layout present, but callback Pressable styles collapsed tabs/buttons. Switched presentation to static styles plus native Android ripple; handlers unchanged         |
| `iteration-03.png`                | Tabs, primary action and guest outline restored. Stale Fast Refresh dimensions and refresh banner affected glass/gradient bounds; used full reload                         |
| `iteration-04.png`                | Stable branded layout with all controls. Button still had gradient; removed it on explicit user request                                                                    |
| `iteration-05-centered-solid.png` | Solid emerald primary and centered tabs/guest content. Android text-padding adjusted for centering; existing debug warning overlay retained in this intermediate evidence  |
| `iteration-06-glass.png`          | Reduced compounded white opacity for a more translucent card; retained current native typography and responsive geometry                                                   |

The wrong-foreground `phone-mode.png` capture is excluded from HSM evidence.
The user approved bringing HSM forward again; subsequent automation checks the
foreground package before any UI action. Initial smaller-display captures were
taken during window resizing and are not responsive acceptance evidence.

Remaining appearance differences: Android font rasterization and native system
bars; clean vector scenery rather than the reference's softly painted texture;
translucent surfaces simulate glass without native backdrop blur. No pixel-identical
or 100% similarity claim is made. Final normalized comparison and responsive
evidence are recorded below after verification.

## Functional verification

- Focused Login/registration/providers/failure/telemetry components: 37/37 pass,
  configured coverage gates pass (`components-focused.log`).
- Mobile units: 268/268 pass with existing coverage gates (`mobile-units.log`).
- UI package: 23/23 including Nature Glass contrast and unchanged marketplace
  checks; lint/typecheck pass (`tokens-verified.log`).
- Mobile lint/typecheck: pass, zero errors, existing warnings retained
  (`mobile-static-final.log`).
- Device: Email/Phone selection, empty password error, password show/hide,
  recovery route, Signup route, invited-Manager route, guest route and Android back
  navigation exercised through real controls. Keyboard opens/dismisses.
- Broad component attempt initially timed out on the first Forgot Password
  navigation case at the unchanged 30-second limit. Keep that failure distinct
  from the earlier focused pass. No test timeout/assertion was weakened.
- API readiness and Metro both passed initially. During concurrent repository work,
  the API watch process repeatedly restarted as dependencies/build files changed;
  subsequent local test-identity registration attempts could not connect.
  Successful device login, invalid server credentials, restoration after successful
  login, real logout/revocation and phone success are therefore not claimed here.
  Corresponding existing unit/component assertions remain intact.

Initial token verification caught marketplace inheritance and a contrast failure;
isolated Nature tokens corrected it while preserving Home colors. Initial selected
component run hit missing files during presentation replacement; it is not counted
as a regression RED or pass. Logs retain both failures. No secret values, OTPs or
session credentials were printed. No existing Root password was reset.

## Final evidence and status

**VISUALLY VERIFIED — FUNCTIONAL TESTS PARTIAL**

The user finalized the current design on 2026-10-28 and requested no further
changes. Solid emerald Sign In and centered card/control content are final.

Raw Pixel captures: `.tools/login-visual-qa/final-login.png` is the clean capture
before the last mint-tint adjustment; `iteration-07-mint.png` shows that final
adjustment with a native debug Refreshing banner. Neither was retouched.
`reference-vs-pixel.png` and `comparison-overlay.png` are diagnostic composites
made before that last tint adjustment, not device screenshots.

Settled responsive captures `small-settled-top.png` and
`small-settled-bottom.png` verify 1080×1920 / 130% text can scroll to Sign In,
guest and Manager controls. Display size was reset and font scale restored to
1.0. Existing density and portrait orientation were preserved.

Final focused components: 37/37, configured coverage gates pass
(`components-final-focused.log`). Final mobile lint/typecheck: 2/2 tasks pass
(`mobile-static-verified.log`). Mobile units: 268/268. UI units: 23/23 plus
lint/typecheck pass. The broad app-wide component attempt retained its initial
30-second navigation timeout and was stopped; it is incomplete/failed, not a
full-suite pass. No assertions, deadlines or coverage floors were weakened.

Successful live email/phone sign-in, persisted-login restoration and live logout
remain unverified here because the API repeatedly restarted during concurrent
work and no usable test credentials were available. Existing unit/component
coverage remains intact. No Root password was changed. This is not full system,
CI or Phase 11 acceptance.

The UI patch remains separate from concurrently staged API/Web/report changes.
No unrelated staged work was committed, unstaged or discarded. A focused commit
is pending safe isolation from that concurrent work.

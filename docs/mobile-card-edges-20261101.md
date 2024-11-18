# App-wide card edge and tint refinement

2026-11-01 · SCOPE-003 / ACC-002 · continuation of the mobile Nature Glass work

Reference: [user Add Photo card](design/references/card-edge-reference-20261101.png).
Use its border/depth treatment, not its cyan palette.

Latest user correction: the stronger interior/reflection described below was
reverted to the previous light icy-mint shade. Border/shadow refinements remain.
The stronger-tint screenshot is historical; it is not the final interior.

## Changes

- Updated existing mobileSurfaces.icyCard: light icy-mint interior, subtle native
  white reflection, mint outline, icy inset edge and soft emerald-tinted shadow.
  User found the initial finish too subtle; current mint/outline is more visible.
- Added fill-free solidCard/glassEdge presets for existing solid/hero/auth cards.
  Solid backgrounds and gradients remain owned by their existing screen styles.
- Seven class-based card modules receive the same native edge style, because the
  installed NativeWind compiler does not support multiple CSS shadows.
- Existing shared Admin, Owner, marketplace, form/record and skeleton surface
  styles inherit the centralized treatment. Owner/marketplace heroes receive edge
  changes only. Authentication retains its approved nature artwork and layout.
- No changes to card size, position, padding, radii, text, icons, actions, routes,
  backend contracts, business rules or permissions. No new wrapper/dependency.
- The final light reflection uses the installed React Native native gradient
  style; it adds no SVG children, live blur or animation to repeated list cards.

## Verification

-58/58 focused Native component tests (5 suites): Login, Owner dashboard,
marketplace listing cards, shared forms and Admin workspace. These passed before
the final visual-only tint/reflection adjustment.
-40/40 final token tests, including composed tinted-surface contrast, no-geometry
presets and fill-free solid-card protection.
-Final Mobile/UI strict typechecks and shared UI build pass.
-Actual Pixel screenshots: `.tools/reports/card-edges-20261101`.
Reviewed dashboard, Platform Operations and Customer home, plus the stronger
final mint dashboard in `visible-dashboard-1.png`. Earlier viewport captures
are retained; scroll positions differ and are not interchangeable baselines.
-Seven dashboard element bounds match baseline after normalizing a56px scroll
offset. Three sampled solid income-card interior colors match exactly.
Evidence: `layout-check.json` and `solid-fill-check.json` in the screenshot folder.
-Logs: `.tools/reports/card-edges-{components,tokens,typecheck,ui-build}.log`.

Dedicated Owner, Manager, Multi-Branch Manager, Resident, guest-authentication,
populated listing/detail/photo states and other Android versions/sizes remain
visually unverified in this pass. Source inheritance and mocked tests do not
certify those rendered states. No accounts/records were fabricated. Device remains
signed in as Root on the Admin dashboard for user review.

# Login styling — 2026-11-01

AUTH-C / SEC-001. User approved the Nature Glass screenshot composition and
requested styling only. Logo, botanical backdrop, landscape, field/tab/button
dimensions, links, safe-area handling and keyboard scroll remain intact.

- Scoped icy-white glass, softer shadows and emerald field/focus outlines.
- Password visibility has native ripple and a rounded accessible touch target.
- Guest outline uses emerald. Existing typography and hierarchy retained.
- User explicitly rejected the gradient draft: final Sign In is solid emerald.
- User requested a slight downward card move: brand-to-card gap increased4dp.
- No authentication, API, routing, permission or database changes.

Evidence: actual Pixel before/after PNG/XML in
`.tools/reports/auth-polish-20261101`. Initial styling callback draft changed
native control layout; corrected to static styles and Android ripple. Bounds of
all seven navigation/tab controls then matched the original. Subsequent user
requested4dp card move is deliberate. Reference image is styling guidance, not
evidence of a rendered application.

Verification:24/24 Login/registration component tests; Mobile/UI strict typechecks
pass. UI lint passes; Mobile retains17 existing errors, none in modified Login
files. Final solid-button/4dp changes are visual only; UI package rebuilt.
Logs: `auth-polish-components.log`, `auth-polish-typecheck.log`,
`auth-polish-lint.log`, `auth-polish-ui-build.log` under `.tools/reports`.

Live successful authentication awaits user-entered credentials; sign-up needs a
user-controlled email/code. Other device sizes/keyboard states are not newly
certified. Admin/other-screen improvements remain paused. Existing containers
were started without migrations, reset, seed or worker startup; phone USB reverse
4000/8081 restored. App left on Login for review.

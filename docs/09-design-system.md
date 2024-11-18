# 09: Design System

## Transport Operations counters (2026-11-22 / UI-001)

Use three compact cards: Transport subscribers, Requests and Monthly transport fees.
The first two are accessible selected buttons; keep the list heading below them.
Show concise per-queue empty states. Do not repeat setup route lists or trip counts.

## Owner Account glass sections (2026-11-21 / UI-001)

Owner Account uses mint glass groups, circular icon wells, soft green corners, thin white edges, row separators and chevrons. Use the current person’s name/email and Owner capability; preserve the avatar fallback. Keep all existing actions, visible Back and accessible long labels while using concise visible row text. The original four-tab Owner navigation highlights Account and keeps the existing tab-bar style. Customer Account styling is unchanged.

### Resident detail reference revision (2026-11-20)

RES-004: use compact translucent white cards, a horizontal identity/contact panel,
four accommodation columns in a full-width card, an illustrated stay timeline, four separate payment cards
in a 2-by-2 grid and compact invoice rows. Shift Bed and Collect Rent stay below;
pending proof changes the latter to Check Invoice. View Payments opens historical bills
and receipts. Private proof images appear in the review screen. Approval/rejection uses
a brief icon spring/fade (respect reduced motion), with export actions on the actual
approved receipt. Transparent card fills and thinner borders replace the heavy inset
outline; avoid Android shadows on transparent panels that render as grey blocks.
Agreement lives in More. Phone/CNIC/email/account values are larger and bold.
Decoration must not overlap accommodation values.
Glass cards use soft green corner gradients and white edge light, with no opaque Android
elevation. Recent bill month/status/amount text is bold and larger with comfortable row spacing.
The main Back stays visible on scroll; every nested panel keeps a visible local Back.
Edit moves into a floating three-dot menu and a centred modal card; opening either
must not expand the identity card or move the overview. Preserve pending-save dismissal
protection. Use shared palette/surface tokens and local SVG artwork; photos and financial states
come from authorized records. Missing photos retain the avatar fallback. The
displayed short resident ID abbreviates the real ID, with its full accessible label.
The Branch Operations Back button returns from details to Residents; the previous
profile/stays page is now optional history from More. Dashboard navigation remains.

### Payment Methods reference revision (2026-11-18)

BKG-007 / BR-01: step 8 uses existing mobile glass/palette tokens for an inset upfront
panel, wrapping emerald selected chips, icon-led payment methods, complete account details,
mint icon tiles and quiet section dividers. Name/identifier fields retain accessibility labels;
Add account is outlined. Lucide icons represent payment methods; no new native dependency,
pricing rule, payment provider integration or invented financial data is introduced.

### Staff setup reference revision (2026-11-18)

CHG-039: Staff setup adopts the user's glass-card reference with existing mobile palette,
surface and owner metric tokens. A user follow-up restores the original Back/progress/Skip
header instead of the initially adopted capsule. Keep the real staff count, mint avatar
circles, complete role pills and outlined Add staff; Continue sits in a bottom glass footer.
Role text has no line clamp, uses the shared heading font and reserves trailing padding
for Android glyph rendering. Long names and custom roles may wrap. Other setup steps retain
their existing layout. No staff data, salary policy or authorization changes.

### Approved M-05 Nature Glass revision (2026-10-28)

The user's final reference supersedes historical M-05 Welcome Back styling below.
Use `natureLoginColors` / `natureLoginMetrics` only for Login; preserve historical
`loginColors` because marketplace tokens inherit it. Stack house/bed, HSM and
HOSTEL MARKETPLACE directly above the translucent card. Real Email/Phone tabs,
identifier/password fields, right-aligned recovery, Sign In, signup, OR EXPLORE,
outlined guest entry and underlined invited-Manager entry remain accessible.
User follow-up requires a solid emerald Sign In fill and centered control content.
Use local SVG mint/cream/botanical/landscape layers and translucent surfaces;
no new native blur dependency, screenshot-as-UI, fake iPhone chrome or auth change.
Device evidence and remaining differences belong in
[the implementation report](hsm-login-nature-glass-implementation.md).

- **Status:** Draft v1, derived from the user's mobile home concept. Pending review.
- **Last updated:** 2026-10-06
- **Reference:** [`design/references/mobile-home-concept-v1.jpeg`](design/references/mobile-home-concept-v1.jpeg) (user-provided concept for screen **M-10 Explore home**)
- **Scope:** one brand system shared by the **mobile app** (primary) and the **management/admin web** (same tokens, denser components).

Colours below were **sampled from the concept image** and then rounded into a usable scale. Final values should be checked for contrast with a tool before code freeze.

---

## Implemented Phase 1 token baseline (2026-10-08)

The continuation brief supplies the approved palette below. It supersedes the
sampled colour values in §2; the sampled tables remain as design history.
`@hsm/ui` is the shared source for typed mobile tokens and generated web CSS.
Both clients support the same capabilities (CHG-005). Plus Jakarta Sans remains
the shared typeface; Lucide icons use a 1.75 stroke.

| Token      | Hex     |
| ---------- | ------- |
| background | #F6FCFC |
| surface    | #FFFFFF |
| icy        | #EAF7F8 |
| aqua       | #D7EEF1 |
| primary    | #0E6F76 |
| accent     | #1A9DA0 |
| deep       | #064F57 |
| heading    | #0A3138 |
| text       | #132A31 |
| secondary  | #647781 |
| muted      | #8798A0 |
| border     | #DCECEE |
| gold       | #F5A800 |
| success    | #18B7AD |
| alert      | #EA3D47 |
| dangerText | #B4232A |

WCAG 2.2 normal-text contrast tests require an unrounded ratio of at least 4.5.
Use secondary text only on white or the page background, never on icy/aqua.
Muted is reserved for disabled/decorative content. Bright feedback colours are
icons paired with readable labels; error text uses dangerText. Phase 2 seat/rent
components remain unimplemented. Inputs use radius 20, cards 18–24, touch targets
48 and shared spacing tokens. No invented listing photos, counts or revenue.

## 1. Design direction (what the concept says)

| Trait                      | In the concept                                                    | Rule for the system                                                                         |
| -------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Trust & calm               | Deep teal + soft mint backgrounds, a Verified badge on every card | Teal is the brand colour; "Verified" is a first-class component                             |
| Local identity             | Faisal Mosque + Margalla hills hero, Islamabad skyline banner     | Twin-Cities imagery in heroes/banners only, never inside data UI                            |
| Photo-led                  | Large real room/building photos on cards                          | Cards lead with **real, moderated hostel photos** (TRUST-003). No stock photos for listings |
| Scannable decision data    | Name, area, rating, price, seats left, near-university line       | Card content = SRS p.14 "decision-driving summary" only                                     |
| Soft, rounded, airy        | 16–24 px radii, light shadows, generous spacing                   | Rounded surfaces, low elevation, 8-pt spacing grid                                          |
| Student-oriented discovery | "Near NUST / FAST / COMSATS / IU" chips, Popular Areas            | Discovery is driven by **admin-managed places and areas** (GEO-002/003), not hard-coded     |

## 2. Colour tokens

### Brand

| Token       | Hex       | Sampled from                 | Use                                             |
| ----------- | --------- | ---------------------------- | ----------------------------------------------- |
| `brand-900` | `#0B3E45` | Darkest teal text/icons      | Headings on tinted areas, pressed states        |
| `brand-800` | `#145660` | "All" chip, active nav icon  | **Primary** buttons, selected chips, active tab |
| `brand-700` | `#0A5551` | "See All" links              | Links, price text, icon accents                 |
| `brand-500` | `#37A8AA` | Filter button                | Secondary accent, focus ring, toggles           |
| `brand-300` | `#43D6D2` | Check mark in Verified badge | Highlights on dark teal                         |
| `brand-100` | `#DDF0EF` | Banner tint                  | Info banners, selected-row background           |
| `brand-50`  | `#EEF6F5` | Page gradient                | App background (top of the gradient)            |

### Neutrals

| Token           | Hex                   | Use                                        |
| --------------- | --------------------- | ------------------------------------------ |
| `ink-900`       | `#0B1215`             | Primary text (headings, card titles)       |
| `ink-600`       | `#4C555C`             | Secondary text (inactive nav labels)       |
| `ink-500`       | `#586172`             | Subtitles, meta text (area, reviews count) |
| `ink-300`       | `#BEC4CA`             | Disabled icons, dividers on tint           |
| `line`          | `#E3EAEA`             | Borders, dividers                          |
| `surface`       | `#FFFFFF`             | Cards, sheets, inputs                      |
| `surface-muted` | `#F6FAFA`             | Secondary surfaces, chips (unselected)     |
| `background`    | `#E6EFEE` → `#F2F7F7` | Page background (soft vertical gradient)   |

### Feedback & rating

| Token     | Hex                               | Use                               |
| --------- | --------------------------------- | --------------------------------- |
| `star`    | `#F4AF0B`                         | Rating stars only                 |
| `danger`  | `#E5484D` (concept dot `#E83E3D`) | Errors, overdue, notification dot |
| `success` | `#1F9D55`                         | Paid / confirmed / approved       |
| `warning` | `#D98E04`                         | Pending verification / expiring   |
| `info`    | `#2F7FBF`                         | Informational notices             |

### Status colours (seat & rent), each always paired with a **label + icon** (p.29, p.50)

| State                           | Background | Foreground | Icon (Lucide)   |
| ------------------------------- | ---------- | ---------- | --------------- |
| Seat **Available**              | `#E3F5EC`  | `#146C43`  | `bed-single`    |
| Seat **Occupied**               | `#E9EEF2`  | `#3A4750`  | `user`          |
| Seat **Reserved** (internal)    | `#FFF4DB`  | `#8A5A00`  | `clock`         |
| Seat **Maintenance** (internal) | `#F1ECFB`  | `#5B3E9E`  | `wrench`        |
| Seat **Unavailable** (public)   | `#F0F2F3`  | `#5F6B73`  | `minus-circle`  |
| Rent **Paid** (green)           | `#E3F5EC`  | `#146C43`  | `check-circle`  |
| Rent **Proof pending** (yellow) | `#FFF4DB`  | `#8A5A00`  | `hourglass`     |
| Rent **Partial** (orange)       | `#FFEBDD`  | `#A3470A`  | `circle-dashed` |
| Rent **Overdue** (red)          | `#FDE7E8`  | `#B4232A`  | `alert-circle`  |
| Rent **Due** (neutral)          | `#EEF2F4`  | `#3A4750`  | `calendar`      |
| Seat **Vacant** (silver)        | `#F3F4F6`  | `#6B7280`  | `circle`        |

### Dark mode

Planned but **not in the MVP launch**. All colours are used **only through tokens**, so a dark theme can be added later by swapping token values.

## 3. Typography

- **Font:** **Plus Jakarta Sans**: geometric, friendly, close to the concept, free (OFL), with good numerals for prices. Load through `expo-font` / `next/font`.
- **Urdu later:** reserve **Noto Nastaliq Urdu**. Layouts must tolerate +30% text length and RTL (SCOPE-003).
- Numbers in tables/boards use tabular figures (`font-variant-numeric: tabular-nums`).

| Token         | Size / line height | Weight           | Concept example                     |
| ------------- | ------------------ | ---------------- | ----------------------------------- |
| `display`     | 32 / 38            | 800              | "Find Your Hostel"                  |
| `title-1`     | 22 / 28            | 700              | Section titles ("Near NUST")        |
| `title-2`     | 18 / 24            | 700              | Card titles ("The Corner Hostel")   |
| `price`       | 18 / 24            | 700, `brand-700` | "Rs 28,000"                         |
| `body`        | 15 / 22            | 400              | Body text                           |
| `body-strong` | 15 / 22            | 600              | Emphasis                            |
| `meta`        | 13 / 18            | 500, `ink-500`   | Area, review counts, "3 seats left" |
| `caption`     | 11 / 14            | 600              | Badges, nav labels                  |

Mobile supports the OS font scale up to 200% without clipping critical actions (p.14 structured detail).

## 4. Spacing, radius, elevation, icons

- **Spacing:** 8-pt grid, `4, 8, 12, 16, 20, 24, 32, 40`. Screen side padding **16** (mobile), content max-width 1440 (web).
- **Radius:** `sm 8` (badges) · `md 12` (inputs, chips) · `lg 16` (cards) · `xl 24` (hero search, bottom sheet) · `full` (pills, avatars).
- **Elevation:** `card` = 0 2 8 rgba(11,62,69,.06) · `raised` = 0 6 20 rgba(11,62,69,.10) (search bar, bottom nav) · `overlay` = 0 12 32 rgba(11,18,21,.18).
- **Icons:** **Lucide** (outline, 1.75 stroke) on both web and mobile. 20 px default, 24 px nav. The concept's graduation-cap, map-pin, bed, heart, bell and sliders are all available.
- **Touch targets:** ≥ 44×44 pt (mobile), ≥ 32 px (desktop dense tables).

## 5. Core components (mobile)

| Component                             | Spec (from the concept)                                                                                                                                    | Notes / rules                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Location selector**                 | Pin in a `brand-100` circle + city + "Twin Cities" caption + chevron                                                                                       | Opens the city/area picker (M-08, GEO-004)                                 |
| **Header actions**                    | Heart (Saved), Bell with `danger` dot                                                                                                                      | Bell = notifications inbox (M-53)                                          |
| **Hero**                              | `display` title + tagline "Safe · Verified · Comfortable Living" + illustration right                                                                      | Illustration is a licensed or commissioned asset. Collapses on scroll      |
| **Search bar**                        | `surface`, radius `xl`, `raised` shadow, search icon, placeholder "Search by area, university or hostel name…"                                             | Opens search with suggestions (`/public/search/suggest`)                   |
| **Filter button**                     | 56 px square, `brand-500` fill, white sliders icon, radius `lg`                                                                                            | Opens the filter sheet (M-12). Shows a count badge when filters are active |
| **Chip**                              | Pill, `surface-muted` + `line` border, icon + label; selected = `brand-800` fill, white text                                                               | "Near {University}" chips come from admin places (top N by popularity)     |
| **Promo/info banner**                 | `brand-100` card, pin icon, title + dot-separated subtitle, chevron, skyline art                                                                           | Max one per screen                                                         |
| **Section header**                    | Icon + `title-1` + optional subtitle `meta` + "See All ›" link (`brand-700`)                                                                               |                                                                            |
| **Hostel card, large** (carousel)     | Photo 4:3 with dots, Verified badge (top-left), heart (top-right); name + chevron; area; ★ rating (count); **price**; seats-left row; near-university rows | See §6 for the required content changes                                    |
| **Hostel card, compact** (horizontal) | Square photo left, details right; seats + nearest university in one meta line                                                                              | For lists (M-11)                                                           |
| **Verified badge**                    | `brand-900` at 90% opacity, white text, `brand-300` check-circle, radius `full`, `caption`                                                                 | Only for platform-approved listings (TRUST-001). Never for unverified      |
| **Rating**                            | `star` icon + value `body-strong` + "(n reviews)" `meta`                                                                                                   | Hidden when there are no reviews ("New")                                   |
| **Area card**                         | Photo with dark gradient, area name `title-2` white, tagline, "{n} hostels", round chevron                                                                 | `n` = real count of approved hostels (no "120+" padding unless it's true)  |
| **Bottom navigation**                 | 5 items, icon + label, active `brand-800` with a filled icon, `raised` surface                                                                             | Tab set pending decision (Q16)                                             |
| **Buttons**                           | Primary `brand-800` / white · Secondary `surface` + `brand-800` border · Tertiary text `brand-700` · Destructive `danger`                                  | Height 48 (mobile), 40 (web); loading state; disabled 40%                  |
| **Inputs**                            | `surface`, `line` border, radius `md`, label above, helper/error below                                                                                     | CNIC mask `#####-#######-#`, phone `+92` prefix                            |
| **Status pill**                       | Token pairs from §2, icon + label                                                                                                                          | Used for seats, bookings, invoices, complaints                             |
| **Skeletons**                         | Shimmer blocks matching card layout                                                                                                                        | Every list's loading state                                                 |
| **Empty state**                       | Illustration (small) + one sentence + primary action                                                                                                       |                                                                            |

## 6. Required changes to the concept (SRS compliance)

The concept is a strong direction. These details must change to match the SRS:

| #   | In the concept                                        | Change to                                                                                                 | Why                                                                                   |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | "NUST (5 min)", "FAST (12 min)" (travel time)         | **"NUST · 1.8 km"** (straight-line or road distance)                                                      | GEO-005: travel-time prediction is **deferred**; MVP shows physical distance          |
| 2   | "Rs. 28,000 /month"                                   | **"From Rs 28,000 /seat"** (or "/room" for per-room pricing)                                              | p.13–14: the card shows the _starting_ real room/seat price, not a hostel-wide number |
| 3   | "3 seats left" always shown                           | Shown **only when live availability is fresh**; otherwise "Check availability"                            | p.14 card freshness, SUB-005 spirit                                                   |
| 4   | Up to 2 universities on large cards                   | Keep **max 2** nearby places                                                                              | p.14                                                                                  |
| 5   | Area cards "120+ hostels"                             | Real counts of approved hostels                                                                           | p.4 marketplace trust                                                                 |
| 6   | Bottom nav: Home · Search · Explore · Saved · Profile | No place for **Stays / My Hostel** or **Messages**, which the resident portal and chat need → see **Q16** | STAY-002, COMM                                                                        |
| 7   | Category not visible                                  | Add a small category tag (Boys / Girls / Working) on cards                                                | p.13 category filter, booking eligibility                                             |
| 8   | Photos look like stock/AI images                      | Production uses **only real, moderated hostel photos**                                                    | TRUST-002/003, p.4 "real" promise                                                     |

### Q16: proposed mobile tab bar (needs your decision)

| Option              | Tabs                                                                                       | Messages / chat                                                 |
| ------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| **A (recommended)** | Home · Search (list ↔ map toggle) · **Stays** ("My Hostel" while active) · Saved · Profile | Chat icon in the header next to the bell                        |
| B                   | Home · Search · Explore (map) · Saved · Profile (exactly as the concept)                   | Stays + Messages inside Profile (two taps deeper for residents) |

Option A keeps the concept's look and adds the resident portal as a first-class tab. Residents use it daily for rent, complaints and the menu.

## 7. Management & admin web (same tokens, denser)

- Same palette, font and icons. **Base text 14 px**, table rows 40 px, compact spacing.
- Layout: left sidebar (`brand-900` background, white icons/labels, active item `brand-500` indicator) + top bar with the **branch switcher** + content on `background`.
- UI kit: **shadcn/ui** themed with these tokens (Tailwind CSS variables). Data tables: TanStack Table with sticky header, column filters, CSV export.
- **Bed Board / Rent Board tiles:** 96×64 px desktop, status token background + icon + label + resident name (truncated). A legend is always visible.
- **Payment verification split view:** 40% queue / 60% detail, with a proof image viewer (zoom, rotate).
- Charts (dashboards/reports): one brand series colour `brand-700`, status colours only for status data.

## 8. Implementation plan (for Phase 1)

- `packages/design-tokens`: a single source (TypeScript object) → generates the **Tailwind preset** (web + NativeWind on mobile) + CSS variables. **No hex values in app code**: tokens only (lint rule).
- `packages/ui` (web) and `apps/mobile/src/components/ui` (native) implement §5/§7 with the same names and props where possible.
- Storybook (web) + a component gallery screen (mobile dev build) for review.
- Accessibility checks: contrast test over every token pair in CI. axe in Playwright for web.

## 9. Next design steps

1. Decide **Q16** (tab bar). _Deferred by user; must be decided before Phase 3 mobile UI._
2. Apply the §6 changes to the home concept and design the key mobile screens in the same style: M-11 results, M-14 hostel detail, M-15 rooms & seats, M-20 request to book, M-32 Active Hostel, M-34 Pay Rent.
3. Web key screens: W-10 dashboard, W-14 Bed Board, W-30 Rent Board, W-32 payment verification.
4. Choose and license the hero/skyline illustrations; produce the app icon and splash.

## M-05 authentication hierarchy refinement (2026-10-13)

Login uses one filled primary action and one secondary account-creation action.
Recovery/verification links retain 48-point touch targets without filled button
backgrounds; guest and invited-Manager paths form quieter separate groups. A white
form surface, token spacing and a bounded content width improve scan order. Safe
areas, keyboard avoidance, scrolling and large-text wrapping remain supported.
This changes presentation only, with all existing authentication routes retained.

### M-05 user reference revision (2026-10-14)

AUTH-C / AUTH-M-005 / CHG-006: this supersedes the previous login presentation.
Login-only @hsm/ui tokens use #006B46/#00543A, #FFFEFC, #080A0B, #667080,
#E1E7E5, #DCEEDD/#CFE5D3 and #FFF1DE; existing semantic error and font retained.
Other screens keep the global palette. Original react-native-svg house/bed logo,
sage/cream curves and campus landscape are local decorative vectors, not screenshot
crops. Welcome Back, subtitle, separate Email/Phone Number/Password fields,
visibility toggle, recovery, Sign In and Sign up follow the supplied reference.
Exactly one identifier required; shared Pakistani normalization retained.

Remember me is omitted because all established mobile sessions already persist in
SecureStore and no optional persistence behavior exists. Do not add a fake checkbox.
Required guest, email verification and Manager activation remain quieter links.
No role selector, social login, CNIC login or phone OTP. Safe-area scrolling,
keyboard avoidance, wrapping text and 48-point secondary touch targets retained.
Final APK and physical visual acceptance are manual follow-up, not claimed here.

User follow-up (2026-10-14) supersedes the separate visible Email/Phone requirement:
M-05 uses the supplied Email/Phone tab selector, one active identifier and Password.
Mode changes clear inactive identifiers and validation while retaining the password;
loading disables mode changes. The Verify email action is removed from Login at the
user's explicit request. Staged email OTP registration and email recovery remain
unchanged. Guest/Manager entry remains available. No fake Remember me behavior.

### Phase 2 customer marketplace reference (2026-10-14)

ACC-002 / BKG-004 / CHG-007: customer marketplace surfaces use scoped
`marketplaceColors` and `marketplaceMetrics` from @hsm/ui, extending the approved
forest-green/off-white reference palette. Management retains the global theme.
Keep the established Plus Jakarta Sans font and accessible touch targets.
Customer navigation is Home, Map, Saved, Bookings, Profile; search remains a Home
control. No top city selector, quick-filter tile grid or extra Search tab.

Home uses HSM branding, actual notification state, own profile initials or a guest
icon, a hero, search/filter controls, approved listing cards, university counts
and actual recently viewed listings. Missing approved photos use labeled neutral
placeholders. Do not insert fake prices, ratings, counts, carousel dots or badges.
Prices preserve paisa; availability requires dates. Loading, empty, network-error
and disabled-submission states are part of each connected screen.

### Phase 2 web customer actions

Public discovery, map, Saved and Customer booking actions use the shared
marketplace green palette through `MarketplaceButton`. Hover, focus, secondary
and disabled states derive from the approved marketplace tokens. Management
controls continue to use the existing shared management components. This styling
addition awaits the current web recheck; see STATUS.md for verification evidence.

### Illustrative Home hero asset (2026-10-17)

A local, generated fictional marketing image is available for the Home hero.
Keep actual headline, guidance and benefits as accessible live text. Shared
marketplaceColors.heroScrim derives from the existing dark green for the overlay;
management and login colors are unchanged. Caption the static scene Illustrative
image; it does not represent a real verified listing. On image failure retain the
live content over the branded background and state Illustration unavailable.
Actual listing cards/gallery still use approved clean Owner media only. See
assets/marketplace-hero-provenance.md for exact prompt and source history. Web
integration/tests are authored, mobile integration and visual acceptance pending.

The photographic draft above is superseded by clearly drawn neutral editorial
artwork, conforming to the SRS v2.2 supplement. Both applications now consume this
same local illustration; the native benefits use equal flexible columns with
wrapping text. Fallbacks preserve live accessible content. Component/static/export
and final visual verification are still pending. No real listing uses this asset.

Hero scrim accessibility correction: the scoped dark-green overlay uses D9 alpha.
The initial B3 alpha failed normal-text AA for white/sage over a brightest possible
image pixel (4.175/3.443). Added semantic contrast tests retain the4.5 criterion;
only overlay opacity changes, not RGB palette or global management/login colors.
Corrected complete UI/web checks and rendered visual acceptance remain pending.

### Private financial confirmation precision (2026-10-21)

FIN-004: private admission and financial confirmation views show the exact PKR amount with two decimal places derived from integer paisa. Summary formatting must not truncate the amount a user is confirming. Continue using existing design tokens, labelled fields, visible branch context and explicit confirmation.

### User-approved Owner design references (2026-10-29; queued)

User requests these Owner-only designs after current location verification. Preserve
the finalized Nature Glass Login. References are visual direction, with real scoped
runtime data and backend rules retained:

- Before first hostel: [empty Owner dashboard](design/references/owner-dashboard-empty-reference-20261029.png).
- Manager appointment: [Invite Manager](design/references/owner-invite-manager-reference-20261029.png).
- After creation: [active Owner dashboard](design/references/owner-dashboard-active-reference-20261029.png).

Do not embed the phone frame/status-bar screenshot as UI, invent figures/properties/
listing images, or introduce unsupported delivery/permissions from illustrative text.
Owner side menu and actual pre/post-hostel states are part of the requested design.
Implementation/acceptance is pending; the references do not certify current UI.

## Shared mobile skeletons (2026-10-31)

Use components/loading/skeleton.tsx for initial data waits, with a layout-specific
variant. Keep navigation/search frames mounted; retain same-scope cached content on
background refresh except where fresh authorization requires masking. Pulse uses
native opacity, reduced-motion preference and unmount cleanup. Mutations retain
explicit progress/disabled controls; placeholders never imply real records.

### Login reference refinement (2026-11-01)

AUTH-C: preserve Nature Glass Login composition and botanical/landscape vectors.
Use scoped icy-white glass/input surfaces, soft shadows and emerald outlines.
Sign In uses solid emerald (user explicitly rejected gradient); original control
dimensions remain. User requested one xs (4dp) extra gap above the login card.

### App-wide mobile Nature Glass (2026-11-01)

SCOPE-003/ACC-002: mobile imports use `mobileColors`, `mobileOwnerColors` and
`mobileMarketplaceColors` from the existing UI package. Original web palettes and
approved Owner hero/marketplace hero/Login artwork remain scoped. Use
`mobileSurfaces.icyCard` for white-based frosted surfaces, `emeraldGlass` for
prominent green surfaces, and `input`/`navigation` for controls. These presets may
contain visual properties only; sizes, padding, radii and layout belong to the
existing screen. NativeWind mirrors the mobile palette and frosted-card utility.

`components/visual-surfaces.tsx` owns the existing Admin glass implementation and
subtle shared NatureBackground. The former Admin module re-exports it for existing
callers. Backgrounds are absolute, decorative and touch/accessibility transparent.
No real-time blur or added animation/dependency. Preserve semantic status colors
and approved illustrations; never insert visual placeholders for backend data.

### Reference card edge and tint refinement (2026-11-01)

The [user-provided Add Photo reference](design/references/card-edge-reference-20261101.png)
defines border/depth language only; retain the HSM emerald/mint palette. Light
cards use the restored light icy-mint interior, mint outer edge,
icy-white inset highlight and soft emerald shadow. Solid/hero cards use the
fill-free `solidCard` or `glassEdge` treatment: no fill/gradient override. Retain
existing radii, border widths, padding and dimensions. Native shadow
styles avoid nested wrappers or extra layout bounds. This NativeWind version
cannot compile multiple shadows; class cards also receive the shared native style.

## Setup inventory actions (2026-11-20)

Use the existing primary-colour Pencil icon in a minimum 44-point accessible target
next to each editable building/floor/room/bed. Keep navigation and removal separate
press targets; concise confirmation names the target and explains room descendants.

Follow-up: the pencil opens Edit name and Delete for all four hierarchy levels.
Names update the existing record with branch permission, expected-name conflict
checking and audit; room/bed IDs, ordinals and financial snapshots are retained.

The property action modal uses explicit native full width within a padded 420-point
maximum frame, a dim backdrop, translucent mint surface, white edges and green
corner light. Edit/Delete are horizontal icon rows. Close and local Back remain
44-point targets; keyboard-aware scroll keeps fields/actions accessible. Primary
Save centers its check icon and label together. Avoid Pressable layout callbacks
here: on this Android/NativeWind runtime they drop the intended row layout.

## Minimal setup forms (CHG-057)

Add Room uses the existing green glass SetupCard, Room number and compact Room photo picker, then Save room. Omit duplicate picker labels/file hints; upload/scan errors remain visible. No planned bed count, shared rent or room security field. Add Bed keeps its explicit monthly rent.

## Bed pricing form (CHG-058)

Place Security deposit directly after Monthly rent inside the existing Add Bed glass card. Use the same money input and concise labels; add no explanatory card or shared room-level field.

## Numeric entry and photo controls (CHG-059 / UI-001)

GroupedNumberInput renders exact string grouping with caret preservation; forms
receive canonical ungrouped strings. NumericTextInput opts in real numeric pads;
identifier inputs remain plain. Never format phone, CNIC, OTP, year or account IDs.
Photo choose actions carry ImagePlus/Camera; selected previews show a corner pencil
with at least the standard touch target. Replace/Delete use the existing glass
action dialog. Private signed URLs remain account/file keyed; pending or rejected
files are never promoted to clean previews. Read-only records expose no mutation.

## Staff employment/salary actions (2026-11-21 / CHG-039)

Within Edit Staff, show a compact monthly-salary row with a pencil, followed by
short icon actions for Suspend/Reactivate and Remove. Use the shared green glass
action dialog for salary and confirmed employment changes, with concise labels,
required reason, last working day for removal and visible errors/retry recovery.
Salary has its own explicit Save salary action; the main Save edits staff details.
Keep Operations focused on history and payments without duplicate edit controls.

## Inline CNIC camera (CHG-060)

Use the standard emerald Camera glyph and full touch target inside the CNIC card,
with a small ready badge after selection. Preserve the input's digit grouping;
reduce spacing only in the accessory variant to avoid clipping. Keep photo
preview/replace/delete in the existing green glass dialog, without another form
card. The completed-number tick stays at the ID badge when the accessory is present.

### Owner Dashboard glass summary (OWN-001, 2026-11-22)

Use existing mint nature background, glass card edges, emerald collection/occupancy
panels and owner color/type tokens. The dashboard uses paired collection cards, a
read-only SVG trend, three compact dues cards, a three-column six-item action grid,
existing quick actions and a rounded four-tab footer. Keep labels readable and
amounts auto-fitting. The hostel hero is code-native SVG; no remote media request.

### Dashboard foliage and frosted cards (2026-11-22 / UI-001)

Owner Dashboard alone uses `mobileSurfaces.dashboardGlass`: translucent mint-white
fill, visible pale icy border and white inset highlights. Keep the green background
and decorative SVG leaves visible through cards; do not change operational cards
app-wide. Occupancy uses larger labels/counts, a taller panel and high-contrast bar.
Income trend uses a smooth bounded curve, gradient area, current-value callout and
subtle point glow; values and month comparisons remain the existing real data.

### Approved mosque hero (2026-11-22 / OWN-001)

Use the user-approved local photorealistic generated asset `owner-mosque-hero-v2.png`
with the mosque on the right and quiet mint space for the existing native headline
on the left. Preserve Owner Dashboard branding and notification behavior. No text
or interactive controls are baked into the image. This supersedes the code-native
hostel illustration for this hero only.

The approved bitmap is composited with horizontal/vertical SVG alpha masks for
soft edge fades into the actual leafy backdrop. A single 650 ms native fade-in
respects Reduce Motion. Text/buttons remain outside the effect; no continuous
fade loop or additional generated bitmap is used.

### Header zone and chart sizing (OWN-001/004, 2026-11-22)

The mosque image bleeds to screen edges and upward behind the status bar, ending
with a soft fade at the upper edge of the branch/month selectors. Safe-area insets still
protect the native branding, notification control and headline. Keep the mosque on
the right using right-anchored image fitting. Native headline uses stronger type,
green emphasis, soft contrast shadow and a restrained curved underline.

Income Trend fills the measured card width with a 190 px interactive canvas (104 px
for all-zero periods); grid, axis labels and touch columns share the same coordinates.
Selected month, exact amount and comparison sit beside the heading to keep the plot
free of floating-tooltip whitespace. Keep the selected
amount readable, edge-clamped and accessible; avoid a tiny centered graph.

Latest user direction: the full-width hero uses a lower-edge alpha fade only. Keep
the top and side edges fully visible within the outlined header zone. The existing
short reduced-motion-aware entrance animation remains separate from edge masking.

Latest hero copy: one larger emerald “Dashboard” brand, then “Your Hostel” over
“Your Control”. Reuse the existing heading family with stronger weights, green
color, restrained shadow and underline. Keep native text, safe-area spacing and
the working notification control; no additional font/image download is needed.

### Supplied hero heading artwork (2026-11-22 / OWN-001)

Raise the native green Dashboard brand by 8 logical pixels inside its safe-area
header. Replace the lower headline/underline with the user-supplied transparent
`owner-manage-hostel-heading.png`, contained at its original 3:1 ratio in the left
column. Preserve alpha, expose “Manage Your Hostel” as the image accessibility label
and keep the notification button and approved mosque composition. Use the dark
forest-green heading token for Dashboard. Reduce photo lighting with a 12% dark-green
overlay inside the bottom-fade mask, keeping native text and controls unaffected. This
supersedes the previous two-line native wording for the lower hero heading.
The follow-up guide alignment raises Dashboard to a total 16 px offset, shifts
the supplied art 14 px left, and enlarges/repositions the mosque by 18% toward
the right edge. Never render the reference guide marks.
Latest visibility correction supersedes that crop: 8% enlargement, slightly upward
and inward positioning to retain all four minarets, and a 24 px left artwork offset.
Latest color direction supersedes the dark overlay: retain natural photo colors,
with a local white readability gradient behind the left text fading out before
the mosque. Preserve the bottom fade and use a 30 px left artwork offset.
The photo alone receives a small right translation at unchanged zoom with full edge coverage;
native text, artwork and readability gradient stay fixed.
Latest follow-up reduces photo scale to 1.03, positions the mosque slightly farther
right, and shifts artwork 34 px left. A single photo instance covers the viewport.
Latest photo placement supersedes this: 0.92 scale, a small right/down translation,
and shared-source edge coverage. Text and fade positions stay fixed.

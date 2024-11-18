# Manager UI audit and cleanup (2026-11-14)

Scope: mobile Manager experience (`apps/mobile`). UI only. No API, schema, migration or
grant changes. Physical-device acceptance is **pending**.

## Screen inventory (source-traced)

| Screen                       | Route / source                                                                                        | Opens from                                 | Grants (server checks)         | Finding                                                                                         | Resolution                                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Entry                        | `lib/owner-mode.ts` `entryFor`                                                                        | sign-in                                    | `managerOf`                    | Managers landed on generic `/account`                                                           | Now `/manager`                                                                         |
| Manager Home                 | `app/manager.tsx`, `components/manager-home.tsx`                                                      | entry, Account → Manager, Customer Account | assigned branch                | Did not exist; dashboard API (`GET /branches/{id}/dashboard`) was unused except a buried button | **New**: Actions Required, Today, Beds, Rent (only when server sends money), tool grid |
| Tool screen                  | `app/manager-branch.tsx` → `BranchPanels single`                                                      | Home tiles                                 | per tool                       | Chip row + inline opener + inner Back                                                           | One title, one Back, no chip row                                                       |
| Bookings                     | `hostel-bookings.tsx`                                                                                 | tool                                       | `booking_manage`               | Raw stay id, long labels                                                                        | Trimmed; tile hidden without grant                                                     |
| Residents                    | `stay-directory.tsx`                                                                                  | tool                                       | `stay_manage` / `finance_view` | ok (standalone already)                                                                         | Kept                                                                                   |
| Rooms & Rent                 | `native-inventory.tsx` (bed board, rent board, proofs, residents directory, walk-in, payment methods) | tool                                       | per tool                       | Duplicate "Branch dashboard" tool                                                               | Removed (Home shows it)                                                                |
| Visits / Waitlist / Messages | `visits.tsx`, `waitlist.tsx`, `chat.tsx`                                                              | tool                                       | server                         | Messages empty text was customer wording                                                        | Branch text "No conversations yet"                                                     |
| Complaints & Services        | `services/staff.tsx` (menu, transport, complaints, reviews)                                           | tool                                       | `stay_manage` / `listing_edit` | Extra opener button                                                                             | Opens directly on tool screen                                                          |
| Rent Rules / Charges         | `native-billing-policy.tsx`, `native-billing-catalog.tsx`                                             | tool                                       | read; Owner-only edit          | Opener + second Back; long read-only text                                                       | Opens directly; "View only · the Owner edits …"                                        |
| Notifications                | `app/owner-notifications.tsx`                                                                         | Home bell                                  | own                            | ok                                                                                              | Reused                                                                                 |
| Account / settings           | `app/account.tsx`                                                                                     | Home avatar                                | own                            | Inline branch list for Manager                                                                  | Replaced by "Open Manager workspace"                                                   |
| Customer Account row         | `marketplace/customer-account-sections.tsx`                                                           | Customer account                           | `managerOf`                    | Second inline branch list (duplicate)                                                           | Row opens `/manager`                                                                   |

Not duplicates (kept separate on purpose): Residents (stays + payments) vs
Rooms & Rent → residents directory (people search); Bed Board vs Rent Board.

## Not changed / remaining

- Section internals beyond the items above (booking cards, bed/rent boards, complaint,
  menu and transport editors, reports) were inspected for long copy; remaining long
  strings are validation, error, privacy or payment disclosures and were kept.
- Manager reports: the API (`/branches/{id}/reports/{type}`) exists but there is no
  mobile Manager reports screen; not added (needs a product decision).
- Visual verification on Android: **not done** by the agent; user to verify.

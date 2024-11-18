# SRS v2.13 supplement — Owner setup location

Approved by the user on 2026-10-29. Refs ONB-001, GEO, CHG-005/006, SEC-003.

## Mobile behavior

Entering verified Owner hostel setup starts one foreground current-location lookup,
subject to the operating system's permission decision. Use the detected position
as the initial pin for a draft without a saved location. Keep an existing saved pin;
the Owner may explicitly replace it using current location or a confirmed map pin.
Remove editable latitude/longitude fields from native hostel setup. The Owner can
choose or change the location manually on the map, without granting location access.

If permission is denied, location services are disabled, the fix times out or the
installed native module is unavailable, explain the result and retain map selection
and partial draft saving. Do not invent coordinates. The Islamabad map viewport
alone never supplies a selected pin. The Owner must verify the pin matches the
hostel; the device may be somewhere else. Confirming a manual pin and later location
responses must not overwrite one another without the Owner's deliberate action.

## Privacy and persistence

Request foreground access only, with approximate location supported. No background
location, ongoing watcher, location foreground service or analytics collection.
Detected positions remain in the current setup's memory until normal explicit
branch save. No coordinates enter diagnostic reports or logs. Existing branch
location storage, API/object authorization, draft privacy, platform review and
public listing disclosure rules are unchanged. Opening the map still explicitly
contacts OpenFreeMap under ADR0026; no automatic map/tile request is required merely
to detect location. Web setup behavior is unchanged by this mobile instruction.

## Migration note

No database migration, coordinate backfill or existing saved-location rewrite.
Add Expo-compatible foreground location support and the minimal native permission
configuration; a new Android binary is required. Preserve installed app data and
session during a certificate-verified update. Old binaries keep a safe map fallback.
This supersedes ADR0026's mobile no-device-location/manual-coordinate decision only.
No completed native acceptance is claimed by this document.

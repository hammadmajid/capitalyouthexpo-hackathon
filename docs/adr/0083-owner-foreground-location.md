# ADR 0083: Foreground location as the initial Owner setup pin

- **Status:** Accepted; implementation/acceptance in progress
- **Date:** 2026-10-29
- **Decision owner:** User

## Context

The user requested automatic location when entering hostel setup, manual location
changes and removal of latitude/longitude fields. ADR0026 previously prohibited
device location and retained coordinate inputs. CHG-017/SRS v2.13 supersede that
mobile behavior without changing the branch-location contract or Web behavior.

## Decision

Use the installed Expo57 compatibility map's expo-location57.0.20 for one bounded
foreground lookup. Ask OS permission when needed; denied/permanently denied/offline
or unavailable results leave manual map selection and partial draft save available.
Use a detected pin only for an empty draft. Preserve saved or manually selected pins
against delayed automatic responses, and isolate lookup state by authenticated actor.
An explicit Use my current location action may replace a saved pin. No background
permission, foreground location service, location watch or diagnostic coordinates.

Keep the canonical ownerMainForm/branch API and existing map confirmation. Coordinates
are internal form values; UI uses pin status and the map. Preserve app data and login
through a signing-certificate-verified native update. The dependency is dynamically
loaded so an older installed binary can display the unavailable/manual fallback.

## Consequences

The native permission/module change requires an Android build. Test denied permission,
disabled services, invalid/slow fixes, account switches, saved-pin preservation and
manual confirmation before physical acceptance. Device location is an initial hint;
it is not evidence of the hostel's address. No data migration is required.

## Sources

- [Expo57 Location](https://docs.expo.dev/versions/v57.0.0/sdk/location/)
- Installed expo bundledNativeModules.json and expo-location plugin types

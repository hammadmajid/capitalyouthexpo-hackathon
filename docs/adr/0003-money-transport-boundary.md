# ADR 0003: Money transport boundary

- **Status:** Accepted
- **Date:** 2026-10-07
- **Source:** SRS p.47, database schema §1, API contract §1, Phase 1 implementation brief

## Context

Development rules say bigint end to end; the v1 API explicitly specifies safe JSON integer
paisa. JSON cannot encode JavaScript bigint directly. Floating-point arithmetic is forbidden.

## Decision

Keep Money as branded nonnegative bigint in domain code and Drizzle bigint mode for
persistence. Explicit shared moneyFromJson/moneyToJson functions validate safe integer
paisa at transport boundaries. Reject decimals, negative values and values outside the
JSON safe integer range. Never perform money arithmetic using number.

This clarifies the existing API contract without changing wire representation or pricing.
Display uses bigint whole rupees as specified by screen conventions. No financial
calculation rounding policy is introduced.

## Consequences

Both clients share exact conversions and domain helpers. Amounts above the safe JSON
integer range require a versioned API change rather than lossy conversion.

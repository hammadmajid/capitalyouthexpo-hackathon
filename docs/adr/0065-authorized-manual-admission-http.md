# ADR 0065: Authorized manual-admission HTTP composition

- **Status:** Guarded source; actual container acceptance pending
- **Date:** 2026-10-21
- **Refs:** STAY-001, RES-001/003/004, RENT-003/004, SEC-003, ACC-001/002/004, AUD-004, NTF-002; CHG-009/010/012/014

## Context

The guarded manual-admission transaction already composes occupancy, original terms, initial obligations, history, audit and recipient-free delivery. Its HTTP caller must supply live authority, ordered participants and authorized idempotency without accepting actor/account facts from the client. The source remains gated on actual infrastructure acceptance.

## Decision

Expose a strict command/result contract that wraps the existing explicit manual Stay input and requires one initial selection for rent and every disclosed fee. Reuse the same selector and completeness policy inside the DB initializer. The server alone derives organization, actor role and the existing relationship's account link; contact matching and fabricated logins remain forbidden.

Before fresh work and successful replay, reload the live actor/session, exact operational branch and current stay_manage, rent_manage and finance_view grants. Resolve an existing relationship only inside that branch and reject archived relationships or unavailable linked accounts. Preflight is not authority: the command transaction locks account participants in global order and repeats current scope and link checks before using the existing 24-hour actor/key/endpoint/scope/body idempotency store. A changed link requires a fresh attempt. The guarded core receives a required transaction/scope-bound authorizer and writes the complete occupancy/agreement/billing/history/audit/event graph atomically. No separate transaction or notification recipient is invented.

Keep the controller optional in the application factory for acceptance fixtures. The production entry point does not register it until actual infrastructure acceptance required by ADR0044 succeeds. This endpoint admits an explicit manual relationship; it does not convert bookings or bypass their evidence, consent, original quote or upfront requirements. Booking handoff remains a separate guarded workflow.

## Consequences

Reuse current permissions, session policy, idempotency store, canonical planners and transaction component. The endpoint introduces no new pricing authority, contact merge, financial defaults, physical migration or deployment. Complete staff/native UI and actual PostgreSQL/Redis acceptance remain required before production activation and phase completion.

## Verification

A generated-route SDK helper validates the command before transport and binds the response to its branch and explicit existing relationship, retaining the caller's command key for retry. Offline OpenAPI generation registers the optional controller solely to describe its contract; production registration remains unchanged.

Contract, scope/session/account, source-authorizer binding, idempotency/replay and Nest HTTP/CSRF units are authored. Actual PostGIS17 migrations, Redis, live sessions, Manager grant revocation, competing inventory, required-event rollback and exact replay are exercised by ten authored Testcontainers HTTP cases. These tests remain NOT RUN LOCALLY. Local API/static and exact-source CI results must be recorded after execution; authored tests alone do not establish acceptance. No migration execution, deployment, pricing change, new delegation or public disclosure is introduced.

Local static/generation31/31 passes with no new lint warnings. Complete SDK547/38 passes L/S99.96%,F100%,B97.61%; its17 admission cases cover exact generated transport, authority/identity injection, response binding, unchanged retry intent, independent fee timing and explicit manual zero. New admission modules are100% all configured coverage. Complete API LOCAL PASS1,921/180,L/S93.17%,F86.75%,B97.15%,29m50s; Stay L/S/B100%,F96.5%, with unchanged configured gates. All66 admission and183 authorization-matrix cases pass; the real container and CI boundaries above remain unchanged.

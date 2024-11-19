import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  managerCredentialInputSchema,
  managerInvitationStateSchema,
  managerInvitationResponseSchema,
} from './manager-invitation.js';
const state = {
  id: randomUUID(),
  branchId: randomUUID(),
  status: 'pending_activation',
  expiresAt: '2026-10-12T00:00:00.000Z',
  acceptance: 'temporary_password',
};
it('AUTH-M-001: reset uses the existing explicit auto/manual credential choice', () => {
  for (const temporaryCredential of [
    { mode: 'auto' },
    { mode: 'manual', password: 'Manual secure phrase' },
  ])
    expect(managerCredentialInputSchema.safeParse({ temporaryCredential }).success).toBe(true);
  for (const temporaryCredential of [
    { mode: 'manual', password: 'short' },
    { mode: 'auto', password: 'Unexpected phrase' },
    { mode: 'unsupported' },
  ])
    expect(managerCredentialInputSchema.safeParse({ temporaryCredential }).success).toBe(false);
  expect(
    managerCredentialInputSchema.safeParse({
      temporaryCredential: { mode: 'auto' },
      userId: state.id,
    }).success,
  ).toBe(false);
});
it('SEC: persisted invitation state never contains credentials or private identity fields', () => {
  expect(managerInvitationStateSchema.parse(state)).toEqual(state);
  for (const field of ['generatedTempPassword', 'passwordHash', 'phone', 'fullName', 'token'])
    expect(
      managerInvitationStateSchema.safeParse({ ...state, [field]: 'Private phrase' }).success,
    ).toBe(false);
  expect(
    managerInvitationResponseSchema.parse({
      ...state,
      generatedTempPassword: 'Generated secret phrase',
    }),
  ).toHaveProperty('generatedTempPassword');
  expect(
    managerInvitationStateSchema.parse({ ...state, acceptance: 'authenticated_account' })
      .acceptance,
  ).toBe('authenticated_account');
  expect(
    managerInvitationResponseSchema.safeParse({ ...state, passwordHash: 'hash' }).success,
  ).toBe(false);
});

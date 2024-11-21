import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { requireSensitiveAccess, type SensitiveContext } from './sensitive.policy.js';
const actorId = randomUUID(),
  subjectId = randomUUID();
const base: SensitiveContext = {
  actorId,
  subjectId,
  actorActive: true,
  resource: 'cnic',
  ownerOrAssignedManager: false,
  approvedBookingOrWalkIn: false,
  rootActive: false,
  authorizedSafetyCase: false,
  justification: '',
};
it('SEC-003 / CHG-004: own identity requires an active actor and excludes private chat', () => {
  expect(() => requireSensitiveAccess({ ...base, subjectId: actorId })).not.toThrow();
  expect(() =>
    requireSensitiveAccess({ ...base, subjectId: actorId, actorActive: false }),
  ).toThrow();
  expect(() =>
    requireSensitiveAccess({ ...base, subjectId: actorId, resource: 'private_chat' }),
  ).toThrow();
});
it.each(['cnic', 'permanent_address', 'private_document'] as const)(
  'CHG-004: authorized branch access to %s requires approved booking or walk-in',
  (resource) => {
    expect(() =>
      requireSensitiveAccess({
        ...base,
        resource,
        ownerOrAssignedManager: true,
        approvedBookingOrWalkIn: true,
      }),
    ).not.toThrow();
    expect(() =>
      requireSensitiveAccess({ ...base, resource, ownerOrAssignedManager: true }),
    ).toThrow();
    expect(() =>
      requireSensitiveAccess({ ...base, resource, approvedBookingOrWalkIn: true }),
    ).toThrow();
  },
);
it('SEC-003: Root requires a server-authorized safety case and meaningful justification', () => {
  const root = {
    ...base,
    resource: 'private_chat' as const,
    rootActive: true,
    authorizedSafetyCase: true,
    justification: 'Reported safety investigation',
  };
  expect(() => requireSensitiveAccess(root)).not.toThrow();
  expect(() => requireSensitiveAccess({ ...root, rootActive: false })).toThrow();
  expect(() => requireSensitiveAccess({ ...root, authorizedSafetyCase: false })).toThrow();
  expect(() => requireSensitiveAccess({ ...root, justification: 'short' })).toThrow();
  expect(() => requireSensitiveAccess({ ...root, actorActive: false })).toThrow();
});
it('SEC-003: absent grants and malformed internal facts fail closed', () => {
  expect(() => requireSensitiveAccess(base)).toThrow();
  expect(() => requireSensitiveAccess({ ...base, actorId: 'invalid' })).toThrow();
  expect(() => requireSensitiveAccess({ ...base, justification: 'x'.repeat(501) })).toThrow();
});

it('CHG-008 / SEC-003: pre-confirmation evidence access requires owning Owner and scoped evidence', () => {
  const evidence = {
    ...base,
    resource: 'private_document' as const,
    owningBookingOwner: true,
    scopedBookingEvidence: true,
  };
  expect(() => requireSensitiveAccess(evidence)).not.toThrow();
  expect(() =>
    requireSensitiveAccess({
      ...evidence,
      owningBookingOwner: false,
      ownerOrAssignedManager: true,
    }),
  ).toThrow();
  expect(() => requireSensitiveAccess({ ...evidence, scopedBookingEvidence: false })).toThrow();
  expect(() => requireSensitiveAccess({ ...evidence, actorActive: false })).toThrow();
});
it.each(['cnic', 'permanent_address', 'private_chat'] as const)(
  'CHG-008: document-review exception does not authorize %s',
  (resource) => {
    expect(() =>
      requireSensitiveAccess({
        ...base,
        resource,
        owningBookingOwner: true,
        scopedBookingEvidence: true,
      }),
    ).toThrow();
  },
);

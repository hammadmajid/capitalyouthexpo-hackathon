import { randomUUID } from 'node:crypto';
import type { ProfileDetails } from '@hsm/contracts';
export function profileDetailsFixture(userId = randomUUID()) {
  return {
    userId,
    fullName: 'Profile edit identity',
    email: 'edit@example.test',
    emailVerified: true,
    phone: '+923001234567',
    gender: 'female',
    cnicLast4: '5671',
    profilePhotoFileId: null,
    customer: { age: 26, institution: 'Institute', completed: true },
    owner: {
      organizationName: null,
      address: 'Private Owner address',
      cnicFrontFileId: randomUUID(),
      cnicBackFileId: randomUUID(),
      agreementVersion: 'owner-foundation-v1',
      agreementAcceptedAt: '2026-10-11T12:00:00.000Z',
      completed: true,
    },
  } satisfies ProfileDetails;
}

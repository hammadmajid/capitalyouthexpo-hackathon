import { randomInt, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { managerAssignments, users } from '@hsm/db';
import type { authFixture } from './auth-fixture.js';
import { managementFixture } from './management-fixture.js';
export type InvitationFixture = Awaited<ReturnType<typeof authFixture>>;
export const invitationPhone = () => '+923' + randomInt(0, 1000000000).toString().padStart(9, '0');
export async function invitationOwner(fixture: InvitationFixture, hash: string, now: Date) {
  const scope = await managementFixture(fixture.connection.db, hash, now);
  const credential = await fixture.service.issue(scope.ownerId, 'mobile');
  const actor = await fixture.service.authenticate(credential.accessToken);
  return { ...scope, actor, headers: { authorization: 'Bearer ' + credential.accessToken } };
}
export const invitationBody = (phone = invitationPhone()) => ({
  fullName: 'Invited Manager',
  phone,
  temporaryCredential: { mode: 'auto' as const },
});
export const inviteManager = (
  fixture: InvitationFixture,
  headers: Record<string, string>,
  branchId: string,
  payload: Record<string, unknown> = invitationBody(),
  key = randomUUID(),
) =>
  fixture.application.inject({
    method: 'POST',
    url: '/v1/manage/branches/' + branchId + '/managers',
    headers: { ...headers, 'idempotency-key': key },
    payload,
  });
export const resetInvitation = (
  fixture: InvitationFixture,
  headers: Record<string, string>,
  branchId: string,
  assignmentId: string,
  payload: Record<string, unknown> = { temporaryCredential: { mode: 'auto' } },
  key = randomUUID(),
) =>
  fixture.application.inject({
    method: 'POST',
    url: '/v1/manage/branches/' + branchId + '/managers/' + assignmentId + '/reset-temp-password',
    headers: { ...headers, 'idempotency-key': key },
    payload,
  });
export const activateInvitation = (
  fixture: InvitationFixture,
  phone: string,
  tempPassword: string,
) =>
  fixture.application.inject({
    method: 'POST',
    url: '/v1/auth/manager/activate',
    payload: {
      phone,
      tempPassword,
      newPassword: 'Permanent invited Manager phrase',
      client: 'mobile',
    },
  });
export async function persistedInvitation(fixture: InvitationFixture, id: string) {
  const [assignment] = await fixture.connection.db
    .select()
    .from(managerAssignments)
    .where(eq(managerAssignments.id, id));
  if (!assignment) throw new Error('Invitation fixture assignment missing');
  const [identity] = await fixture.connection.db
    .select()
    .from(users)
    .where(eq(users.id, assignment.userId));
  if (!identity) throw new Error('Invitation fixture identity missing');
  return { assignment, identity };
}

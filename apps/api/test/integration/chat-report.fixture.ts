import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import {
  adminAccounts,
  adminRoleGrants,
  brands,
  branches,
  chatMessages,
  conversations,
  customerProfiles,
  managerAssignments,
  organizations,
  users,
} from '@hsm/db';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { ChatRepository } from '../../src/chat/repository.js';
import { ChatService } from '../../src/chat/service.js';
import { testKeys } from '../keys.js';
import { authFixture } from './auth-fixture.js';
export async function chatReportFixture() {
  const now = new Date('2026-10-24T03:00:00Z');
  const f = await authFixture(new AuthCrypto(testKeys()), now, {}, [], (database, idempotency) => ({
    chat: new ChatService(
      new ChatRepository(database, 'chat-report-fixture', () => now),
      idempotency,
    ),
  }));
  try {
    const ids = {
      customer: randomUUID(),
      stranger: randomUUID(),
      owner: randomUUID(),
      manager: randomUUID(),
      support: randomUUID(),
      moderator: randomUUID(),
      verification: randomUUID(),
      root: randomUUID(),
    };
    await f.connection.db.insert(users).values(
      Object.entries(ids).map(([name, id]) => ({
        id,
        fullName: 'Case fixture ' + name,
        emailVerifiedAt: now,
      })),
    );
    await f.connection.db.insert(customerProfiles).values(
      [ids.customer, ids.stranger].map((userId) => ({
        userId,
        age: 20,
        profileCompletedAt: now,
      })),
    );
    await f.connection.db
      .insert(adminAccounts)
      .values({ userId: ids.root, isRoot: true, status: 'active' });
    await f.connection.db.insert(adminAccounts).values(
      [ids.support, ids.moderator, ids.verification].map((userId) => ({
        userId,
        status: 'active' as const,
      })),
    );
    await f.connection.db.insert(adminRoleGrants).values(
      [
        { adminUserId: ids.support, role: 'support' as const },
        { adminUserId: ids.moderator, role: 'content_moderator' as const },
        { adminUserId: ids.verification, role: 'verification' as const },
      ].map((value) => ({ ...value, grantedByUserId: ids.root, grantedAt: now })),
    );
    const tokens = Object.fromEntries(
      await Promise.all(
        Object.entries(ids).map(
          async ([name, id]) => [name, (await f.service.issue(id, 'mobile')).accessToken] as const,
        ),
      ),
    );
    const organizationId = randomUUID(),
      brandId = randomUUID();
    await f.connection.db
      .insert(organizations)
      .values({ id: organizationId, ownerUserId: ids.owner, name: 'Safety fixture' });
    await f.connection.db
      .insert(brands)
      .values({ id: brandId, organizationId, name: 'Safety fixture' });
    return {
      ...f,
      now,
      ids,
      tokens,
      async source() {
        await f.connection.db
          .update(managerAssignments)
          .set({ status: 'deactivated', deactivatedAt: now })
          .where(eq(managerAssignments.userId, ids.manager));
        const branchId = randomUUID(),
          otherBranchId = randomUUID(),
          conversationId = v7(),
          foreignConversationId = v7(),
          assignmentId = v7();
        await f.connection.db.insert(branches).values(
          [branchId, otherBranchId].map((id) => ({
            id,
            brandId,
            organizationId,
            name: 'Safety branch',
            slug: id,
          })),
        );
        await f.connection.db.insert(managerAssignments).values({
          id: assignmentId,
          branchId,
          userId: ids.manager,
          appointedByUserId: ids.owner,
          status: 'active',
          activatedAt: now,
        });
        await f.connection.db.insert(conversations).values([
          { id: conversationId, branchId, customerUserId: ids.customer },
          { id: foreignConversationId, branchId, customerUserId: ids.stranger },
        ]);
        const messages = await f.connection.db
          .insert(chatMessages)
          .values(
            Array.from({ length: 9 }, (_, index) => ({
              id: v7(),
              conversationId,
              senderUserId: index % 2 ? ids.owner : ids.customer,
              senderSide: index % 2 ? ('branch' as const) : ('customer' as const),
              body: 'PRIVATE CASE MESSAGE ' + index,
              createdAt: new Date(now.getTime() + index),
            })),
          )
          .returning();
        const target = messages[4];
        if (!target) throw new Error('Missing case source');
        return {
          branchId,
          otherBranchId,
          conversationId,
          foreignConversationId,
          assignmentId,
          messages,
          target,
        };
      },
    };
  } catch (error) {
    await f.close();
    throw error;
  }
}

import { asc, eq } from 'drizzle-orm';
import { branchMenus, menuItems, menuMealTimes, type Database } from '@hsm/db';
import {
  DomainError,
  branchMenuSchema,
  menuUpdateInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { AuditWriter, type Transaction } from '../audit/writer.js';
import { requireTransaction } from '../idempotency/context.js';
import type { IdempotencyService } from '../idempotency/service.js';
import { inventoryFailure } from '../booking/errors.js';
import { lockOwnStay, lockStaffScope } from './scope.js';
import { requirePublicBranch } from './public-branch.js';
const id = stayIdentifierSchema;
async function readMenu(tx: Pick<Transaction, 'select'>, branchId: string) {
  const [head] = await tx.select().from(branchMenus).where(eq(branchMenus.branchId, branchId));
  const items = head
    ? await tx
        .select({
          dayOfWeek: menuItems.dayOfWeek,
          meal: menuItems.meal,
          description: menuItems.description,
        })
        .from(menuItems)
        .where(eq(menuItems.branchId, branchId))
        .orderBy(asc(menuItems.dayOfWeek), asc(menuItems.meal))
        .limit(21)
    : [];
  const times = head
    ? await tx
        .select({
          dayOfWeek: menuMealTimes.dayOfWeek,
          meal: menuMealTimes.meal,
          startsAt: menuMealTimes.startsAt,
          endsAt: menuMealTimes.endsAt,
        })
        .from(menuMealTimes)
        .where(eq(menuMealTimes.branchId, branchId))
        .orderBy(asc(menuMealTimes.dayOfWeek), asc(menuMealTimes.meal))
        .limit(21)
    : [];
  return branchMenuSchema.parse({
    branchId,
    version: head?.version ?? 0,
    updatedAt: head?.updatedAt.toISOString() ?? null,
    items,
    times,
  });
}
// SERV-001: one weekly menu per branch. Staff with listing_edit replace the whole week against
// the expected version; residents and the public only read. A missing menu is version 0.
export class MenuService {
  constructor(
    private readonly database: Database,
    private readonly idempotency: IdempotencyService,
    private readonly clock: () => Date = () => new Date(),
    private readonly audit = new AuditWriter(),
  ) {}
  staffRead(actor: Actor, branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      await lockStaffScope(tx, actor, branch, [], this.clock);
      return readMenu(tx, branch);
    });
  }
  ownRead(actor: Actor, stayId: unknown) {
    const stay = id.parse(stayId);
    return this.database.transaction(async (tx) => {
      const own = await lockOwnStay(tx, actor, stay, this.clock, true);
      return readMenu(tx, own.stay.branchId);
    });
  }
  publicRead(branchId: unknown) {
    const branch = id.parse(branchId);
    return this.database.transaction(async (tx) => {
      await requirePublicBranch(tx, branch);
      return readMenu(tx, branch);
    });
  }
  update(actor: Actor, key: unknown, branchId: unknown, body: unknown) {
    const branch = id.parse(branchId),
      input = menuUpdateInputSchema.parse(body);
    return this.idempotency
      .execute(
        { actor, key: id.parse(key), endpoint: 'PUT branch menu', status: 200 },
        { branch },
        input,
        branchMenuSchema,
        async (tx) =>
          Boolean(await lockStaffScope(tx, actor, branch, ['listing_edit'], this.clock)),
        async () => this.replace(requireTransaction(), actor, branch, input),
      )
      .catch(inventoryFailure);
  }
  private async replace(
    tx: Transaction,
    actor: Actor,
    branch: string,
    input: ReturnType<typeof menuUpdateInputSchema.parse>,
  ) {
    const scope = await lockStaffScope(tx, actor, branch, ['listing_edit'], this.clock),
      now = this.clock();
    const [head] = await tx
      .select()
      .from(branchMenus)
      .where(eq(branchMenus.branchId, branch))
      .for('update');
    if ((head?.version ?? 0) !== input.expectedVersion)
      throw new DomainError('CONFLICT', 409, 'The menu changed; reload before saving');
    const before = await readMenu(tx, branch),
      version = input.expectedVersion + 1;
    if (head)
      await tx
        .update(branchMenus)
        .set({ version, updatedByUserId: actor.userId, updatedAt: now })
        .where(eq(branchMenus.branchId, branch));
    else
      await tx
        .insert(branchMenus)
        .values({ branchId: branch, version, updatedByUserId: actor.userId, updatedAt: now });
    await tx.delete(menuItems).where(eq(menuItems.branchId, branch));
    if (input.items.length)
      await tx.insert(menuItems).values(input.items.map((item) => ({ ...item, branchId: branch })));
    const times = input.times ?? before.times;
    if (input.times) {
      await tx.delete(menuMealTimes).where(eq(menuMealTimes.branchId, branch));
      if (input.times.length)
        await tx
          .insert(menuMealTimes)
          .values(input.times.map((time) => ({ ...time, branchId: branch })));
    }
    await this.audit.hostel(tx, {
      organizationId: scope.organizationId,
      branchId: branch,
      actorUserId: actor.userId,
      actorRole: scope.actorRole,
      action: 'menu.updated',
      targetType: 'branch_menu',
      targetId: branch,
      before: { version: before.version, items: before.items, times: before.times },
      after: { version, items: input.items, times },
      createdAt: now,
    });
    return readMenu(tx, branch);
  }
}

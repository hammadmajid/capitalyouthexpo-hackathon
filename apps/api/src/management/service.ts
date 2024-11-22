import { citySummarySchema, areaSummarySchema, type AreaPageInput } from '@hsm/contracts';
import {
  managerStateSchema,
  organizationSummarySchema,
  branchSummarySchema,
  managerSummarySchema,
  type ManagementPage,
  type ManagerAction,
} from '@hsm/contracts';
import { DomainError } from '@hsm/contracts';
import type { Actor } from '../authorization/store.js';
import { verifyPassword } from '../auth/crypto.js';
import type { ManagementReadRepository } from './read.repository.js';
import type { StaffRepository } from './staff.repository.js';
function page<T extends { id: string }>(rows: T[], limit: number) {
  const data = rows.slice(0, limit);
  return { data, nextCursor: rows.length > limit ? (data.at(-1)?.id ?? null) : null };
}
export class ManagementService {
  constructor(
    private readonly reads: ManagementReadRepository,
    private readonly staff: StaffRepository,
  ) {}
  async cities(actor: Actor, input: ManagementPage) {
    return page(
      (await this.reads.cities(actor, input)).map((row) => citySummarySchema.parse(row)),
      input.limit,
    );
  }
  async areas(actor: Actor, cityId: string, input: AreaPageInput) {
    return page(
      (await this.reads.areas(actor, cityId, input)).map((row) => areaSummarySchema.parse(row)),
      input.limit,
    );
  }
  async organizations(actor: Actor, input: ManagementPage) {
    return page(
      (await this.reads.organizations(actor, input)).map((row) =>
        organizationSummarySchema.parse(row),
      ),
      input.limit,
    );
  }
  async branches(actor: Actor, input: ManagementPage, ownerOnly: boolean) {
    return page(
      (await this.reads.branches(actor, input, ownerOnly)).map((row) =>
        branchSummarySchema.parse(row),
      ),
      input.limit,
    );
  }
  async branch(actor: Actor, id: string) {
    return branchSummarySchema.parse(await this.reads.branch(actor, id));
  }
  async managers(actor: Actor, branchId: string, input: ManagementPage) {
    return page(
      (await this.reads.managers(actor, branchId, input)).map((row) =>
        managerSummarySchema.parse(row),
      ),
      input.limit,
    );
  }
  // AUTH-M-006: removing a Manager or cancelling an invitation first re-checks the Owner's
  // own password. A wrong password is a validation error (not 401, which ends sessions).
  async remove(actor: Actor, branchId: string, assignmentId: string, currentPassword: string) {
    const hash = await this.reads.passwordHash(actor.userId);
    if (!(await verifyPassword(hash, currentPassword)))
      throw new DomainError('VALIDATION_FAILED', 400, 'Incorrect password');
    return this.transition(actor, branchId, assignmentId, 'deactivate');
  }
  async transition(
    actor: Actor,
    branchId: string,
    assignmentId: string,
    action: ManagerAction,
    reason: string | null = null,
  ) {
    return managerStateSchema.parse(
      await this.staff.transition(actor, branchId, assignmentId, action, reason),
    );
  }
}

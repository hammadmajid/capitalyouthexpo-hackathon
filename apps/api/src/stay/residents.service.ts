import {
  residentContactUpdateSchema,
  residentDirectoryQuerySchema,
  residentDirectoryPageSchema,
  residentProfileSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { z } from 'zod';
import type { Database } from '@hsm/db';
import type { Actor } from '../authorization/store.js';
import { ResidentRepository } from './residents.repository.js';
import { updateResidentContact } from './resident-update.js';
import {
  readAccountLinkRequests,
  decideAccountLink,
  ownAccountLinkStatus,
} from './account-link-requests.js';
import { residentAccountLinkDecisionSchema } from '@hsm/contracts';
export class ResidentService {
  constructor(
    private readonly repository: ResidentRepository,
    private readonly database?: Database,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  linkRequests(actor: Actor, branch: unknown, query: unknown) {
    if (!this.database) throw new Error('Resident links need a database');
    const { cursor } = z.object({ cursor: z.string().uuid().optional() }).strict().parse(query);
    return readAccountLinkRequests(
      this.database,
      actor,
      stayIdentifierSchema.parse(branch),
      cursor,
      this.clock,
    );
  }
  decideLink(actor: Actor, branch: unknown, request: unknown, input: unknown) {
    if (!this.database) throw new Error('Resident links need a database');
    return decideAccountLink(
      this.database,
      actor,
      stayIdentifierSchema.parse(branch),
      stayIdentifierSchema.parse(request),
      residentAccountLinkDecisionSchema.parse(input).action,
      this.clock,
    );
  }
  ownLinkStatus(actor: Actor) {
    if (!this.database) throw new Error('Resident links need a database');
    return ownAccountLinkStatus(this.database, actor, this.clock);
  }
  // RES-006: audited correction of an offline resident's name and contact details.
  async updateContact(actor: Actor, branchId: unknown, residentId: unknown, input: unknown) {
    if (!this.database) throw new Error('Resident updates need a database');
    return updateResidentContact(
      this.database,
      actor,
      stayIdentifierSchema.parse(branchId),
      stayIdentifierSchema.parse(residentId),
      residentContactUpdateSchema.parse(input),
      this.clock,
    );
  }
  async directory(actor: Actor, branchId: unknown, query: unknown) {
    return residentDirectoryPageSchema.parse(
      await this.repository.directory(
        actor,
        stayIdentifierSchema.parse(branchId),
        residentDirectoryQuerySchema.parse(query),
      ),
    );
  }
  async profile(actor: Actor, branchId: unknown, residentId: unknown, query: unknown = {}) {
    z.object({}).strict().parse(query);
    return residentProfileSchema.parse(
      await this.repository.profile(
        actor,
        stayIdentifierSchema.parse(branchId),
        stayIdentifierSchema.parse(residentId),
      ),
    );
  }
}
export function residentService(database: Database, clock: () => Date = () => new Date()) {
  return new ResidentService(new ResidentRepository(database, clock), database, clock);
}

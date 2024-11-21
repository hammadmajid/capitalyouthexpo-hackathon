import type { z } from 'zod';
import type { adminRoleSchema } from '@hsm/contracts';
export type AdminRole = z.infer<typeof adminRoleSchema>;
export interface ScopeStore {
  customer(userId: string): Promise<boolean>;
  owner(userId: string, organizationId?: string): Promise<boolean>;
  branch(userId: string, branchId: string, ownerOnly: boolean): Promise<boolean>;
  object(
    userId: string,
    assignmentId: string,
    ownerOnly: boolean,
    branchId?: string,
  ): Promise<{ branchId: string } | undefined>;
  admin(userId: string): Promise<{ isRoot: boolean; roles: AdminRole[] } | undefined>;
}
export type Actor = { userId: string; sessionId: string };

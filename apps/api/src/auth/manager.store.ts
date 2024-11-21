import type { managerAssignments, users } from '@hsm/db';
export type ManagerIdentity = Pick<
  typeof users.$inferSelect,
  'id' | 'accountStatus' | 'passwordHash'
>;
export type ManagerInvitation = typeof managerAssignments.$inferSelect;
export interface ManagerTransaction {
  identity: ManagerIdentity | undefined;
  invitation: ManagerInvitation | undefined;
  attempt(count: number, now: Date): Promise<void>;
  activate(passwordHash: string, now: Date): Promise<void>;
}
export interface ManagerStore {
  transaction<T>(phone: string, work: (value: ManagerTransaction) => Promise<T>): Promise<T>;
}

import { hostelAuditLog, platformAuditLog, sensitiveAccessLog, type Database } from '@hsm/db';
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type AuditRow = Omit<typeof platformAuditLog.$inferInsert, 'id'>;
type HostelAuditRow = Omit<typeof hostelAuditLog.$inferInsert, 'id'>;
type SensitiveAuditRow = Omit<typeof sensitiveAccessLog.$inferInsert, 'id'>;
// SEC-003: only a transaction may write privileged or sensitive access evidence.
export class AuditWriter {
  async hostel(transaction: Transaction, event: HostelAuditRow) {
    await transaction.insert(hostelAuditLog).values(event);
  }
  async platform(transaction: Transaction, event: AuditRow) {
    await transaction.insert(platformAuditLog).values(event);
  }
  async sensitive(transaction: Transaction, event: SensitiveAuditRow) {
    await transaction.insert(sensitiveAccessLog).values(event);
  }
}

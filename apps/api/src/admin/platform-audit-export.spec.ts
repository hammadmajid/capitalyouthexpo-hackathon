import { beforeEach, expect, it, vi } from 'vitest';
import { platformAuditLog } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { exportPlatformAudit } from './platform-audit-export.js';
import { lockAdmin, platformAudit } from './scope.js';
vi.mock('./scope.js', () => ({ lockAdmin: vi.fn(), platformAudit: vi.fn() }));
const id = '10000000-0000-4000-8000-000000000001',
  now = new Date('2026-10-30T06:00:00.000Z');
const actor = { userId: id, sessionId: id };
const event = (n: number) => ({
  id: BigInt(n),
  actorId: id,
  actorRole: 'root',
  action: '=formula',
  targetType: 'review',
  targetId: id,
  createdAt: now,
  before: { passwordHash: 'never-export' },
  ip: 'private',
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lockAdmin).mockResolvedValue({ userId: id, isRoot: true, roles: [] });
});
it('AUD-001 RPT-001: bounded metadata CSV neutralizes formula cells and audits exact row count', async () => {
  const f = queryFixture();
  f.enqueue(
    platformAuditLog,
    Array.from({ length: 5001 }, (_, n) => event(n + 1)),
  );
  const file = await exportPlatformAudit(f.database, actor, { action: '=formula' }, () => now);
  expect(file.truncated).toBe(true);
  expect(file.body.split('\r\n')).toHaveLength(5002);
  expect(file.body).toContain('"\'=formula"');
  expect(file.body).not.toContain('never-export');
  expect(file.body).not.toContain('private');
  expect(f.operations.find((o) => o.kind === 'limit')?.args).toEqual([5001]);
  expect(platformAudit).toHaveBeenCalledWith(
    f.transaction,
    expect.anything(),
    expect.objectContaining({
      action: 'audit.exported',
      after: { format: 'csv', rows: 5000, truncated: true },
    }),
    now,
  );
});
it('AUD-001 SEC-003: audit failure cannot disclose export; unsafe bounds and revoked authority deny', async () => {
  const f = queryFixture();
  f.enqueue(platformAuditLog, [event(1)]);
  vi.mocked(platformAudit).mockRejectedValue(new Error('Audit unavailable'));
  await expect(exportPlatformAudit(f.database, actor, {}, () => now)).rejects.toThrow(
    'Audit unavailable',
  );
  expect(() => exportPlatformAudit(f.database, actor, { limit: 100000 }, () => now)).toThrow();
  vi.mocked(lockAdmin).mockRejectedValue(new Error('Root required'));
  await expect(exportPlatformAudit(f.database, actor, {}, () => now)).rejects.toThrow(
    'Root required',
  );
});

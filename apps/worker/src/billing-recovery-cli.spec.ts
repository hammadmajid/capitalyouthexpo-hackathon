import { beforeEach, expect, it, vi } from 'vitest';
import pino from 'pino';
import { billingRecoveryCli, parseBillingRecoveryArgs } from './billing-recovery-cli.js';
const db = vi.hoisted(() => ({ create: vi.fn(), recover: vi.fn(), close: vi.fn() }));
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  createDatabase: db.create,
  recoverResidentBilling: db.recover,
}));
beforeEach(() => {
  vi.clearAllMocks();
  db.create.mockReturnValue({ db: 'fixture-database', close: db.close });
  db.recover.mockResolvedValue({ status: 'pending' });
});
const logger = pino({ level: 'silent' });
const branch = '00000000-0000-4000-8000-000000000001';
const job = '00000000-0000-4000-8000-000000000002';
const args = ['recover-billing', branch, job, '5', 'INC-013', '--apply'];
it('AUD-013: maintenance invocation queues exact recovery and closes the connection', async () => {
  await billingRecoveryCli(args, { DATABASE_URL: 'postgres://localhost/recovery_fixture' }, logger);
  expect(db.recover).toHaveBeenCalledWith('fixture-database', {
    branchId: branch,
    jobId: job,
    expectedAttempts: 5,
    incident: 'INC-013',
  });
  expect(db.close).toHaveBeenCalledOnce();
});
it('AUD-013: recovery failure still closes the maintenance connection', async () => {
  db.recover.mockRejectedValueOnce(new Error('Fixture unavailable'));
  await expect(
    billingRecoveryCli(args, { DATABASE_URL: 'postgres://localhost/recovery_fixture' }, logger),
  ).rejects.toThrow('Fixture unavailable');
  expect(db.close).toHaveBeenCalledOnce();
});
it.each([
  {},
  { DATABASE_URL: 'https://example.invalid' },
  { CNIC_ENCRYPTION_KEY: 'fixture' },
  { CNIC_HASH_KEY: 'fixture' },
])('AUD-013 / SEC-003: invalid maintenance environment %# opens no connection', async (env) => {
  await expect(billingRecoveryCli(args, env, logger)).rejects.toThrow();
  expect(db.create).not.toHaveBeenCalled();
});
it('AUD-013 / SEC-003: maintenance recovery requires explicit scope, budget, incident and apply', () => {
  expect(parseBillingRecoveryArgs(args)).toEqual({
    branchId: branch,
    jobId: job,
    expectedAttempts: 5,
    incident: 'INC-013',
  });
});
it.each(
  [
    [],
    args.slice(0, -1),
    [...args, 'unexpected'],
    ['recover-billing', branch, job, '4', 'INC-013', '--apply'],
    ['recover-billing', branch, job, '5', 'private free text', '--apply'],
    ['recover-billing', branch, 'not-a-job', '5', 'INC-013', '--apply'],
    ['recover-all', branch, job, '5', 'INC-013', '--apply'],
  ].map((input) => ({ input })),
)('AUD-013 / SEC-003: invalid recovery arguments %# fail closed', ({ input }) => {
  expect(() => parseBillingRecoveryArgs(input)).toThrow();
});

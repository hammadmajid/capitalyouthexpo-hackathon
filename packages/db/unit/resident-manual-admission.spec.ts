import { admissionStartRegressions } from './resident-manual-admission.fixture.js';
import { beforeEach, expect, it, vi } from 'vitest';
import { DomainError } from '@hsm/contracts';
import type { ManualAdmissionContext } from '../src/resident-manual-admission.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
const mocks = vi.hoisted(() => ({
  hierarchy: vi.fn(),
  target: vi.fn(),
  available: vi.fn(),
  terms: vi.fn(),
  complete: vi.fn(),
  expire: vi.fn(),
  party: vi.fn(),
  records: vi.fn(),
  billing: vi.fn(),
  history: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('../src/inventory-lock.js', () => ({ lockInventoryBranch: mocks.hierarchy }));
vi.mock('../src/inventory-expiry.js', () => ({ expireRoomReservations: mocks.expire }));
vi.mock('../src/resident-admission-target.js', () => ({
  lockResidentAdmissionTarget: mocks.target,
}));
vi.mock('../src/resident-admission-availability.js', () => ({
  requireResidentAdmissionAvailable: mocks.available,
}));
vi.mock('../src/resident-admission-terms.js', () => ({
  validateResidentAdmissionTerms: mocks.terms,
}));
vi.mock('../src/resident-admission-party.js', async (original) => ({
  ...(await original<typeof import('../src/resident-admission-party.js')>()),
  resolveResidentAdmissionParty: mocks.party,
}));
vi.mock('../src/resident-admission-billing.js', async (original) => ({
  ...(await original<typeof import('../src/resident-admission-billing.js')>()),
  initializeAdmissionBilling: mocks.billing,
  requireCompleteSelection: mocks.complete,
}));
vi.mock('../src/resident-manual-admission-write.js', () => ({
  writeManualAdmissionRecords: mocks.records,
  writeManualAdmissionHistory: mocks.history,
}));
vi.mock('../src/resident-lifecycle.js', () => ({ enqueueResidentLifecycle: mocks.publish }));
import { admitManualResident } from '../src/resident-manual-admission.js';
import {
  admissionInput as input,
  admissionNow as now,
  admissionHierarchy as hierarchy,
  admissionTarget as target,
  admissionParty as party,
  admissionIds as ids,
} from './resident-manual-admission.fixture.js';
const tx = {} as PostingTransaction;
function authorize() {
  return vi.fn(async () => undefined);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.hierarchy.mockResolvedValue(hierarchy);
  mocks.target.mockResolvedValue(target);
  mocks.available.mockResolvedValue({ admittedOn: '2028-02-01' });
  mocks.terms.mockResolvedValue(input.manual.terms);
  mocks.party.mockResolvedValue(party);
});
it('STAY-001 / RENT-003 / NTF-002: actual manual composer validates authority, scope, availability and terms before one caller transaction writes occupancy, billing, history and lifecycle', async () => {
  const auth = authorize(),
    result = await admitManualResident(tx, input, now, auth);
  expect(auth).toHaveBeenCalledWith(tx, input, now);
  expect(result).toMatchObject({ residentId: ids.resident, state: 'active', version: 1 });
  const context = mocks.records.mock.calls[0]?.[1] as ManualAdmissionContext | undefined;
  if (!context) throw Error('Admission context missing');
  expect(context).toMatchObject({
    input,
    now,
    target,
    admittedOn: '2028-02-01',
    party,
    stayId: result.stayId,
    agreementId: result.agreementId,
    assignmentId: result.assignmentId,
  });
  expect(mocks.party).toHaveBeenCalledWith(
    tx,
    { scope: input.scope, resident: input.manual.resident, expectedUserId: null },
    now,
  );
  expect(mocks.billing).toHaveBeenCalledWith(
    tx,
    {
      scope: { ...input.scope, stayId: result.stayId, agreementId: result.agreementId },
      selections: input.initialBilling,
    },
    now,
  );
  expect(mocks.history).toHaveBeenCalledWith(tx, context);
  expect(mocks.publish).toHaveBeenCalledWith(
    tx,
    { event: 'resident.admitted', stayId: result.stayId, historyId: context.historyId },
    now,
  );
  const stages = [
    auth,
    mocks.hierarchy,
    mocks.target,
    mocks.available,
    mocks.terms,
    mocks.complete,
    mocks.expire,
    mocks.party,
    mocks.records,
    mocks.billing,
    mocks.history,
    mocks.publish,
  ].map((stage) => {
    expect(stage).toHaveBeenCalledTimes(1);
    return stage.mock.invocationCallOrder[0];
  });
  expect(stages).toEqual([...stages].sort((a, b) => (a ?? 0) - (b ?? 0)));
});
it('RES-001/003: explicit historical billing start and linked account are retained without a synthetic arrival timestamp', async () => {
  const manual = {
    ...input.manual,
    resident: { kind: 'existing', residentId: ids.resident },
    period: { ...input.manual.period, moveInDate: '2028-01-01' },
  };
  mocks.party.mockResolvedValue({ ...party, userId: ids.user });
  await admitManualResident(tx, { ...input, manual, expectedUserId: ids.user }, now, authorize());
  expect(mocks.records.mock.calls[0]?.[1]).toMatchObject({
    now,
    admittedOn: '2028-02-01',
    input: { manual: { period: { moveInDate: '2028-01-01' } } },
    party: { userId: ids.user },
  });
});
it('SEC-003: missing mandatory authorizer fails before any admission query/write', async () => {
  await expect(admitManualResident(tx, input, now)).rejects.toMatchObject({
    code: 'INTERNAL',
    status: 503,
  });
  expect(mocks.hierarchy).not.toHaveBeenCalled();
  expect(mocks.records).not.toHaveBeenCalled();
});
it('SEC-003: live admission denial prevents hierarchy, financial and occupancy work', async () => {
  const auth = authorize();
  auth.mockRejectedValueOnce(new DomainError('FORBIDDEN', 403, 'Admission grant revoked'));
  await expect(admitManualResident(tx, input, now, auth)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  expect(mocks.hierarchy).not.toHaveBeenCalled();
  expect(mocks.records).not.toHaveBeenCalled();
});
it.each([
  {
    name: 'organization',
    value: { ...hierarchy, organization: { ...hierarchy.organization, archivedAt: now } },
  },
  { name: 'brand', value: { ...hierarchy, brand: { ...hierarchy.brand, archivedAt: now } } },
  { name: 'branch', value: { ...hierarchy, branch: { ...hierarchy.branch, archivedAt: now } } },
])('SEC-003: archived $name cannot admit', async ({ value }) => {
  mocks.hierarchy.mockResolvedValue(value);
  await expect(admitManualResident(tx, input, now, authorize())).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  expect(mocks.target).not.toHaveBeenCalled();
  expect(mocks.records).not.toHaveBeenCalled();
});
it('SEC-003: organization mismatch cannot authorize another branch operation', async () => {
  mocks.hierarchy.mockResolvedValue({
    ...hierarchy,
    organization: { ...hierarchy.organization, id: ids.brand },
  });
  await expect(admitManualResident(tx, input, now, authorize())).rejects.toMatchObject({
    code: 'BRANCH_FORBIDDEN',
  });
  expect(mocks.target).not.toHaveBeenCalled();
});
it('STAY-001: future move-in cannot be represented as actual occupancy today', async () => {
  await expect(
    admitManualResident(
      tx,
      {
        ...input,
        manual: { ...input.manual, period: { ...input.manual.period, moveInDate: '2028-02-02' } },
      },
      now,
      authorize(),
    ),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(mocks.terms).not.toHaveBeenCalled();
  expect(mocks.records).not.toHaveBeenCalled();
});
it.each([
  { name: 'target', stage: mocks.target },
  { name: 'available', stage: mocks.available },
  { name: 'terms', stage: mocks.terms },
  { name: 'expire', stage: mocks.expire },
  { name: 'party', stage: mocks.party },
  { name: 'records', stage: mocks.records },
  { name: 'billing', stage: mocks.billing },
  { name: 'history', stage: mocks.history },
  { name: 'publish', stage: mocks.publish },
])(
  'ACC-004: required $name failure propagates, leaving transaction rollback to its owner',
  async ({ stage }) => {
    stage.mockRejectedValueOnce(new Error('Required admission stage failed'));
    await expect(admitManualResident(tx, input, now, authorize())).rejects.toThrow(
      'Required admission stage failed',
    );
  },
);
it('FIN-004: incomplete initial selection rejects before resident/Stay creation', async () => {
  mocks.complete.mockImplementationOnce(() => {
    throw new DomainError('VALIDATION_FAILED', 400, 'Select every disclosed fee');
  });
  await expect(admitManualResident(tx, input, now, authorize())).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  });
  expect(mocks.party).not.toHaveBeenCalled();
  expect(mocks.records).not.toHaveBeenCalled();
});
it.each([
  { expectedUserId: ids.user },
  { scope: { ...input.scope, actorRole: 'system' } },
  { state: 'active' },
  { initialBilling: [] },
  { initialBilling: [{ item: 'rent', cadence: 'periodic', periodIndex: -1 }] },
  { manual: { ...input.manual, customerUserId: ids.user } },
])('SEC-003: malformed or injected command %# fails before authorization', async (patch) => {
  const auth = authorize();
  await expect(admitManualResident(tx, { ...input, ...patch }, now, auth)).rejects.toThrow();
  expect(auth).not.toHaveBeenCalled();
});
it('SEC-003: invalid server clock cannot authorize admission', async () => {
  const auth = authorize();
  await expect(admitManualResident(tx, input, new Date(Number.NaN), auth)).rejects.toThrow();
  expect(auth).not.toHaveBeenCalled();
});

it.each(admissionStartRegressions)(
  'RENT-003 / FIN-004: $name starting cursor cannot omit the initial obligation',
  async ({ command }) => {
    await expect(admitManualResident(tx, command, now, authorize())).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
    expect(mocks.party).not.toHaveBeenCalled();
    expect(mocks.records).not.toHaveBeenCalled();
  },
);

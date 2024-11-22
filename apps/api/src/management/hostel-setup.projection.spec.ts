import { randomUUID } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { areas, branchVerificationEvents, brands, branches, cities } from '@hsm/db';
import type { Transaction } from '../audit/writer.js';
import { newMainBranch } from './hostel-setup.policy.js';
import {
  mainBranchValues,
  readHostelSetup,
  validateSetupGeography,
} from './hostel-setup.projection.js';
const brand = {
  id: randomUUID(),
  organizationId: randomUUID(),
  name: 'Private hostel',
  logoFileId: null,
};
const city = { id: randomUUID(), isActive: true };
const area = { id: randomUUID(), cityId: city.id, parentId: null, level: 'sector', isActive: true };
const subArea = { ...area, id: randomUUID(), parentId: area.id, level: 'sub_area' };
const branch = {
  ...newMainBranch(randomUUID(), { name: brand.name }),
  cityId: city.id,
  areaId: area.id,
  subAreaId: subArea.id,
  latitude: 33.68,
  longitude: 73.04,
};
let brandRows: unknown[], branchRows: unknown[], cityRows: unknown[], areaRows: unknown[];
let eventRows: unknown[] = [];
let table: unknown;
const chain = {
  from: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  for: vi.fn(),
  then: vi.fn(),
};
const database = { select: vi.fn() };
const transaction = database as unknown as Transaction;
function rows() {
  if (table === brands) return brandRows;
  if (table === branches) return branchRows;
  if (table === cities) return cityRows;
  if (table === areas) return areaRows;
  if (table === branchVerificationEvents) return eventRows;
  throw new Error('Unexpected projection table');
}
beforeEach(() => {
  vi.clearAllMocks();
  brandRows = [brand];
  branchRows = [branch];
  cityRows = [city];
  areaRows = [area, subArea];
  eventRows = [];
  database.select.mockReturnValue(chain);
  chain.from.mockImplementation((value: unknown) => {
    table = value;
    return chain;
  });
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockReturnValue(chain);
  chain.for.mockImplementation(async () => rows());
  chain.then.mockImplementation((resolve: (value: unknown) => unknown) => resolve(rows()));
});
it('OWN-001: fresh projection converts actual PostGIS longitude/latitude and removes internal row fields', async () => {
  branchRows = [{ ...branch, internalPrivateValue: 'not returned' }];
  const result = await readHostelSetup(transaction, brand.id);
  expect(result).toMatchObject({
    ...brand,
    mainBranch: {
      id: branch.id,
      isPrimary: true,
      location: { latitude: branch.latitude, longitude: branch.longitude },
    },
  });
  expect(result.mainBranch).not.toHaveProperty('internalPrivateValue');
  expect(result.mainBranch).not.toHaveProperty('latitude');
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls.at(-1)?.[0] as SQL);
  expect(query.params).toEqual([brand.id, brand.organizationId, true]);
  expect(query.sql).toContain('"branches"."archived_at" is null');
  const projection = database.select.mock.calls.at(-1)?.[0] as { latitude: SQL; longitude: SQL };
  expect(new PgDialect().sqlToQuery(projection.latitude).sql).toContain('ST_Y');
  expect(new PgDialect().sqlToQuery(projection.longitude).sql).toContain('ST_X');
  expect(chain.for).toHaveBeenCalledWith('update');
});
it('OWN-001: legacy brands without primary and null geography stay incomplete', async () => {
  branchRows = [];
  expect(await readHostelSetup(transaction, brand.id)).toMatchObject({
    mainBranch: null,
    missingFields: ['main_branch'],
  });
  for (const patch of [{ latitude: null }, { longitude: null }]) {
    branchRows = [{ ...branch, ...patch }];
    expect((await readHostelSetup(transaction, brand.id)).mainBranch?.location).toBeNull();
  }
});
it('SEC: absent or archived brand is concealed', async () => {
  brandRows = [];
  await expect(readHostelSetup(transaction, brand.id)).rejects.toMatchObject({ status: 404 });
  expect(chain.for).not.toHaveBeenCalled();
});
it('ONB-001: actual selected city and area rows are share-locked before hierarchy validation', async () => {
  await validateSetupGeography(transaction, { ...branch, location: null });
  expect(chain.for.mock.calls).toEqual([['share'], ['share']]);
  expect(chain.orderBy).toHaveBeenCalledWith(areas.id);
});
it('ONB-001: absent draft geography does not query or fabricate lookup rows', async () => {
  await validateSetupGeography(transaction, newMainBranch(randomUUID(), { name: brand.name }));
  expect(database.select).not.toHaveBeenCalled();
  await validateSetupGeography(transaction, {
    ...newMainBranch(randomUUID(), { name: brand.name }),
    cityId: city.id,
  });
  expect(database.select).toHaveBeenCalledTimes(1);
});
it('SEC: missing city and foreign sub-area parent fail with an opaque location denial', async () => {
  cityRows = [];
  await expect(validateSetupGeography(transaction, branch)).rejects.toMatchObject({ status: 404 });
  cityRows = [city];
  areaRows = [area, { ...subArea, parentId: randomUUID() }];
  await expect(validateSetupGeography(transaction, branch)).rejects.toMatchObject({ status: 404 });
});
it('OWN-001: persistence maps only editable fields and binds validated EWKT as a geography value', () => {
  const now = new Date();
  const values = mainBranchValues(
    { ...branch, location: { latitude: 33.68, longitude: 73.04 } },
    now,
  );
  expect(values).toMatchObject({
    name: branch.name,
    cityId: city.id,
    areaId: area.id,
    location: 'SRID=4326;POINT(73.04 33.68)',
    updatedAt: now,
  });
  expect(values).not.toHaveProperty('verificationStatus');
  expect(values).not.toHaveProperty('isPrimary');
  expect(values).not.toHaveProperty('organizationId');
  expect(mainBranchValues({ ...branch, location: null }, now).location).toBeNull();
});
it('ADM-007 OWN-001: a returned hostel carries the latest HSM reason; other states carry none', async () => {
  branchRows = [{ ...branch, verificationStatus: 'changes_requested' }];
  eventRows = [{ reason: 'Add the complete street address.' }];
  const returned = await readHostelSetup(transaction, brand.id);
  expect(returned.verificationNote).toBe('Add the complete street address.');
  const query = new PgDialect().sqlToQuery(chain.where.mock.calls.at(-1)?.[0] as SQL);
  expect(query.params).toContain('changes_requested');
  branchRows = [{ ...branch, verificationStatus: 'submitted' }];
  vi.clearAllMocks();
  database.select.mockReturnValue(chain);
  const submitted = await readHostelSetup(transaction, brand.id);
  expect(submitted).not.toHaveProperty('verificationNote');
  expect(chain.from).not.toHaveBeenCalledWith(branchVerificationEvents);
});

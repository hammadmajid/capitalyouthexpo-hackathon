import {
  residentContactUpdateSchema,
  stayRecordQuerySchema,
  type StayRecord,
} from '@hsm/contracts';
import { z } from 'zod';
import {
  residentDirectoryPageSchema,
  residentDirectoryQuerySchema,
  residentProfileSchema,
  stayIdentifierSchema,
  stayRecordSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
// RES-004: staff resident directory; every row must be a distinct resident.
export async function readResidentDirectory(
  client: ApiClient,
  branch: unknown,
  inputQuery: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    query = residentDirectoryQuerySchema.parse(inputQuery);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/residents', {
      params: {
        path: { branchId },
        query: {
          limit: query.limit,
          sort: query.sort,
          ...(query.q === undefined ? {} : { q: query.q }),
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.linked === undefined ? {} : { linked: query.linked }),
          ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
        },
      },
    }),
    residentDirectoryPageSchema,
  );
  if (
    page.data.length > query.limit ||
    new Set(page.data.map((row) => row.id)).size !== page.data.length
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
export async function readResidentProfile(client: ApiClient, branch: unknown, resident: unknown) {
  const branchId = stayIdentifierSchema.parse(branch),
    residentId = stayIdentifierSchema.parse(resident);
  const profile = await readApi(
    client.GET('/v1/branches/{branchId}/residents/{residentId}', {
      params: { path: { branchId, residentId } },
    }),
    residentProfileSchema,
  );
  if (profile.id !== residentId || profile.branchId !== branchId)
    throw new ClientFailure('INVALID_RESPONSE');
  return profile;
}
// STAY-002: staff Stay record (agreements, assignments, lifecycle history).
export async function readStaffStayRecord(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  query: unknown = {},
) {
  const branchId = stayIdentifierSchema.parse(branch),
    stayId = stayIdentifierSchema.parse(stay);
  const page = stayRecordQuerySchema.parse(query),
    wire =
      page.beforeAgreementVersion === undefined
        ? {}
        : { beforeAgreementVersion: page.beforeAgreementVersion };
  const record = await readApi(
    client.GET('/v1/branches/{branchId}/stays/{stayId}/record', {
      params: { path: { branchId, stayId }, query: wire },
    }),
    stayRecordSchema,
  );
  if (record.stayId !== stayId || record.branch.id !== branchId)
    throw new ClientFailure('INVALID_RESPONSE');
  verifyAgreementPage(record, page.beforeAgreementVersion);
  return record;
}
// CHG-012: the signed-in account's own linked Stay record.
export async function readOwnStayRecord(client: ApiClient, stay: unknown, query: unknown = {}) {
  const stayId = stayIdentifierSchema.parse(stay);
  const page = stayRecordQuerySchema.parse(query),
    wire =
      page.beforeAgreementVersion === undefined
        ? {}
        : { beforeAgreementVersion: page.beforeAgreementVersion };
  const record = await readApi(
    client.GET('/v1/me/stays/{stayId}/record', { params: { path: { stayId }, query: wire } }),
    stayRecordSchema,
  );
  if (record.stayId !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  verifyAgreementPage(record, page.beforeAgreementVersion);
  return record;
}

function verifyAgreementPage(record: StayRecord, before?: number) {
  let previous = before ?? 2147483648;
  const ids = new Set<string>();
  for (const row of record.agreements) {
    if (row.version >= previous || ids.has(row.id)) throw new ClientFailure('INVALID_RESPONSE');
    previous = row.version;
    ids.add(row.id);
    for (const evidence of row.acknowledgements ?? [])
      if (
        evidence.stayId !== record.stayId ||
        evidence.branchId !== record.branch.id ||
        evidence.agreementId !== row.id ||
        evidence.agreementVersion !== row.version
      )
        throw new ClientFailure('INVALID_RESPONSE');
  }
  if (
    record.nextAgreementBeforeVersion !== undefined &&
    (record.agreements.length !== 50 ||
      record.nextAgreementBeforeVersion !== record.agreements.at(-1)?.version)
  )
    throw new ClientFailure('INVALID_RESPONSE');
}
// RES-006: staff correct an offline resident's name and contact; the server audits it.
const residentContactSchema = residentContactUpdateSchema.extend({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
});
export async function updateResidentContact(
  client: ApiClient,
  branch: unknown,
  resident: unknown,
  input: unknown,
) {
  const branchId = stayIdentifierSchema.parse(branch),
    residentId = stayIdentifierSchema.parse(resident);
  const saved = await readApi(
    client.PUT('/v1/branches/{branchId}/residents/{residentId}/contact', {
      params: { path: { branchId, residentId } },
      body: residentContactUpdateSchema.parse(input),
    }),
    residentContactSchema,
  );
  if (saved.id !== residentId || saved.branchId !== branchId)
    throw new ClientFailure('INVALID_RESPONSE');
  return saved;
}
export type ResidentContact = z.infer<typeof residentContactSchema>;

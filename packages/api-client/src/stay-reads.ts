import {
  stayIdentifierSchema,
  stayReadQuerySchema,
  customerStayQuerySchema,
  stayPageSchema,
  stayDetailSchema,
  inventoryPageSequenceIsValid,
  type StayPage,
  type StayReadQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
function requirePage(page: StayPage, query: StayReadQuery, branchId?: string) {
  if (
    page.data.length > query.limit ||
    (page.nextCursor !== null && page.data.length !== query.limit) ||
    !inventoryPageSequenceIsValid(page.data, query.cursor) ||
    page.data.some(
      (row) =>
        (branchId !== undefined && row.branchId !== branchId) ||
        (query.state !== undefined && row.state !== query.state) ||
        (query.roomId !== undefined && row.currentAssignment?.roomId !== query.roomId) ||
        (query.bedId !== undefined && row.currentAssignment?.bedId !== query.bedId) ||
        (query.moveInFrom !== undefined && row.moveInDate < query.moveInFrom) ||
        (query.moveInTo !== undefined && row.moveInDate > query.moveInTo) ||
        (query.expectedLeaveFrom !== undefined &&
          (row.expectedLeaveDate === null || row.expectedLeaveDate < query.expectedLeaveFrom)) ||
        (query.expectedLeaveTo !== undefined &&
          (row.expectedLeaveDate === null || row.expectedLeaveDate > query.expectedLeaveTo)),
    )
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return page;
}
function pageQuery(query: StayReadQuery) {
  return {
    limit: query.limit,
    ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    ...(query.state === undefined ? {} : { state: query.state }),
  };
}
function staffQuery(query: StayReadQuery) {
  return {
    ...pageQuery(query),
    ...(query.q === undefined ? {} : { q: query.q }),
    ...(query.roomId === undefined ? {} : { roomId: query.roomId }),
    ...(query.bedId === undefined ? {} : { bedId: query.bedId }),
    ...(query.moveInFrom === undefined ? {} : { moveInFrom: query.moveInFrom }),
    ...(query.moveInTo === undefined ? {} : { moveInTo: query.moveInTo }),
    ...(query.expectedLeaveFrom === undefined
      ? {}
      : { expectedLeaveFrom: query.expectedLeaveFrom }),
    ...(query.expectedLeaveTo === undefined ? {} : { expectedLeaveTo: query.expectedLeaveTo }),
  };
}
export async function readStaffStays(client: ApiClient, input: string, inputQuery: unknown = {}) {
  const branchId = stayIdentifierSchema.parse(input),
    query = stayReadQuerySchema.parse(inputQuery);
  const page = await readApi(
    client.GET('/v1/branches/{branchId}/stays', {
      params: { path: { branchId }, query: staffQuery(query) },
    }),
    stayPageSchema,
  );
  return requirePage(page, query, branchId);
}
export async function readCustomerStays(client: ApiClient, inputQuery: unknown = {}) {
  const query = customerStayQuerySchema.parse(inputQuery);
  const page = await readApi(
    client.GET('/v1/me/stays', { params: { query: pageQuery(query) } }),
    stayPageSchema,
  );
  return requirePage(page, query);
}
export async function readStaffStay(client: ApiClient, input: string, inputStay: string) {
  const branchId = stayIdentifierSchema.parse(input),
    stayId = stayIdentifierSchema.parse(inputStay);
  const detail = await readApi(
    client.GET('/v1/branches/{branchId}/stays/{stayId}', {
      params: { path: { branchId, stayId } },
    }),
    stayDetailSchema,
  );
  if (detail.id !== stayId || detail.branchId !== branchId)
    throw new ClientFailure('INVALID_RESPONSE');
  return detail;
}
export async function readCustomerStay(client: ApiClient, inputStay: string) {
  const stayId = stayIdentifierSchema.parse(inputStay);
  const detail = await readApi(
    client.GET('/v1/me/stays/{stayId}', { params: { path: { stayId } } }),
    stayDetailSchema,
  );
  if (detail.id !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  return detail;
}

import {
  fundMovementInputSchema,
  fundMovementResultSchema,
  stayCheckoutInputSchema,
  stayCheckoutResultSchema,
  stayExtensionInputSchema,
  stayExtensionResultSchema,
  stayIdentifierSchema,
  staySettlementSchema,
  stayTransferInputSchema,
  stayTransferResultSchema,
  stayFinalStatementResponseSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = (value: unknown) => stayIdentifierSchema.parse(value);
const header = (key: string) => ({ 'Idempotency-Key': id(key) });
export const finalStatementResponseSchema = stayFinalStatementResponseSchema;
// exactOptionalPropertyTypes: drop absent optional fields instead of sending undefined.
function withoutUndefined<T extends object>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };
}
function sameStay<T extends { stayId: string }>(result: T, stayId: string) {
  if (result.stayId !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// RES-005: same-branch transfer; the server checks grants, version and availability.
export async function transferStay(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay),
    body = stayTransferInputSchema.parse(input);
  return sameStay(
    await readApi(
      client.POST('/v1/branches/{branchId}/stays/{stayId}/transfer', {
        params: { path: { branchId: id(branch), stayId }, header: header(key) },
        body: withoutUndefined(body),
      }),
      stayTransferResultSchema,
    ),
    stayId,
  );
}
export async function extendStay(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay),
    body = stayExtensionInputSchema.parse(input);
  return sameStay(
    await readApi(
      client.POST('/v1/branches/{branchId}/stays/{stayId}/extension', {
        params: { path: { branchId: id(branch), stayId }, header: header(key) },
        body,
      }),
      stayExtensionResultSchema,
    ),
    stayId,
  );
}
// OUT-006: success only with the completed Stay and its frozen statement.
export async function checkoutStay(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay),
    body = stayCheckoutInputSchema.parse(input);
  const result = sameStay(
    await readApi(
      client.POST('/v1/branches/{branchId}/stays/{stayId}/checkout', {
        params: { path: { branchId: id(branch), stayId }, header: header(key) },
        body,
      }),
      stayCheckoutResultSchema,
    ),
    stayId,
  );
  if (result.statement.stayId !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// OUT-003/004: deposit/advance apply, deduction or recorded refund.
export async function recordStayFundMovement(
  client: ApiClient,
  branch: unknown,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const body = fundMovementInputSchema.parse(input);
  const result = await readApi(
    client.POST('/v1/branches/{branchId}/stays/{stayId}/fund-movements', {
      params: { path: { branchId: id(branch), stayId: id(stay) }, header: header(key) },
      body: { paymentId: body.paymentId, movement: withoutUndefined(body.movement) },
    }),
    fundMovementResultSchema,
  );
  if (
    result.paymentId !== body.paymentId ||
    result.kind !== body.movement.kind ||
    result.amountPaisa !== body.movement.amountPaisa
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readStaySettlement(client: ApiClient, stay: unknown, branch?: unknown) {
  const stayId = id(stay);
  const result =
    branch === undefined
      ? await readApi(
          client.GET('/v1/me/stays/{stayId}/settlement', { params: { path: { stayId } } }),
          staySettlementSchema,
        )
      : await readApi(
          client.GET('/v1/branches/{branchId}/stays/{stayId}/settlement', {
            params: { path: { branchId: id(branch), stayId } },
          }),
          staySettlementSchema,
        );
  return sameStay(result, stayId);
}
export async function readFinalStatement(client: ApiClient, stay: unknown, branch?: unknown) {
  const stayId = id(stay);
  const result =
    branch === undefined
      ? await readApi(
          client.GET('/v1/me/stays/{stayId}/final-statement', { params: { path: { stayId } } }),
          finalStatementResponseSchema,
        )
      : await readApi(
          client.GET('/v1/branches/{branchId}/stays/{stayId}/final-statement', {
            params: { path: { branchId: id(branch), stayId } },
          }),
          finalStatementResponseSchema,
        );
  if (result.statement.stayId !== stayId) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}

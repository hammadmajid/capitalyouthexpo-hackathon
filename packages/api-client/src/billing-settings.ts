import {
  billingSettingsTargetSchema,
  transportBillingPolicyInputSchema,
  type TransportBillingPolicy,
  type TransportBillingPolicyInput,
  billingSettingsInputSchema,
  billingSettingsReadSchema,
  billingPolicyVersionSchema,
  stayIdentifierSchema,
  type BillingSettingsTarget,
} from '@hsm/contracts';
import { z } from 'zod';
import type { ApiClient } from './client.js';
import type { paths } from './generated/schema.js';
import { ClientFailure, readApi } from './result.js';

type Version = z.infer<typeof billingPolicyVersionSchema>;
function localVersion(value: Version, target: BillingSettingsTarget) {
  if (
    value.level !== (target.roomTypeId === undefined ? 'branch' : 'room_type') ||
    value.scopeId !== (target.roomTypeId ?? target.branchId)
  )
    throw new ClientFailure('INVALID_RESPONSE');
}
export async function readBillingSettings(client: ApiClient, input: BillingSettingsTarget) {
  const target = billingSettingsTargetSchema.parse(input);
  const operation =
    target.roomTypeId === undefined
      ? client.GET('/v1/branches/{branchId}/billing-policy', {
          params: { path: { branchId: target.branchId } },
        })
      : client.GET('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/billing-policy', {
          params: { path: { branchId: target.branchId, roomTypeId: target.roomTypeId } },
        });
  const result = await readApi(operation, billingSettingsReadSchema);
  if (result.target.branchId !== target.branchId || result.target.roomTypeId !== target.roomTypeId)
    throw new ClientFailure('INVALID_RESPONSE');
  if (result.localVersion) {
    localVersion(result.localVersion, target);
    if (result.effectiveVersion?.id !== result.localVersion.id)
      throw new ClientFailure('INVALID_RESPONSE');
  }
  const effective = result.effectiveVersion;
  if (effective?.level === 'branch' && effective.scopeId !== target.branchId)
    throw new ClientFailure('INVALID_RESPONSE');
  if (effective?.level === 'room_type') localVersion(effective, target);
  return result;
}
type PolicyWireBody =
  paths['/v1/branches/{branchId}/billing-policy']['put']['requestBody']['content']['application/json'];
// Exact optional wire properties are omitted, never asserted into generated types.
function policyWireBody(input: z.infer<typeof billingSettingsInputSchema>): PolicyWireBody {
  const { feeBilling, agreementTemplate, transportBilling, ...rest } = input.policy;
  void transportBilling;
  const required = { ...rest, ...(agreementTemplate ? { agreementTemplate } : {}) };
  if (feeBilling === undefined) return { policy: required };
  const { monthly, ...timing } = feeBilling;
  return {
    policy: {
      ...required,
      feeBilling: { ...timing, ...(monthly === undefined ? {} : { monthly }) },
    },
  };
}
export async function saveBillingSettings(
  client: ApiClient,
  input: BillingSettingsTarget,
  body: unknown,
  key: string,
) {
  const target = billingSettingsTargetSchema.parse(input),
    normalized = billingSettingsInputSchema.parse(body),
    value = policyWireBody(normalized);
  const header = { 'Idempotency-Key': stayIdentifierSchema.parse(key) };
  const operation =
    target.roomTypeId === undefined
      ? client.PUT('/v1/branches/{branchId}/billing-policy', {
          params: { path: { branchId: target.branchId }, header },
          body: value,
        })
      : client.PUT('/v1/branches/{branchId}/inventory/room-types/{roomTypeId}/billing-policy', {
          params: { path: { branchId: target.branchId, roomTypeId: target.roomTypeId }, header },
          body: value,
        });
  const result = await readApi(operation, billingPolicyVersionSchema);
  localVersion(result, target);
  // FIN-004: both objects follow the same strict Zod shape; JSON order is canonical and undefined optionals are omitted.
  if (
    JSON.stringify({ ...result.policy, transportBilling: undefined }) !==
    JSON.stringify({ ...normalized.policy, transportBilling: undefined })
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}

type TransportPolicyWire =
  paths['/v1/branches/{branchId}/billing-policy/transport']['put']['requestBody']['content']['application/json']['transportBilling'];

export function transportBillingWire(input: TransportBillingPolicy): TransportPolicyWire {
  if (!('dueDay' in input)) {
    if (!input.offer) return { monthlySubscription: input.monthlySubscription };
    const { offer, monthlySubscription } = input;
    return monthlySubscription ? { offer, monthlySubscription } : { offer };
  }
  const { offer, ...rules } = input;
  return offer ? { ...rules, offer } : rules;
}

export async function saveTransportBillingPolicy(
  client: ApiClient,
  branchId: string,
  body: TransportBillingPolicyInput,
  key: string,
) {
  const target = { branchId: stayIdentifierSchema.parse(branchId) };
  const input = transportBillingPolicyInputSchema.parse(body);
  const result = await readApi(
    client.PUT('/v1/branches/{branchId}/billing-policy/transport', {
      params: { path: target, header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) } },
      body: { ...input, transportBilling: transportBillingWire(input.transportBilling) },
    }),
    billingPolicyVersionSchema,
  );
  localVersion(result, target);
  const expected = input.transportBilling;
  const actual = result.policy.transportBilling;
  const comparable =
    !expected.offer && 'dueDay' in expected && actual && 'dueDay' in actual
      ? { ...actual, offer: undefined }
      : !('dueDay' in expected) &&
          expected.offer?.mode === 'included' &&
          !expected.monthlySubscription &&
          actual?.offer?.mode === 'included'
        ? { offer: actual.offer }
        : actual;
  if (JSON.stringify(comparable) !== JSON.stringify(expected))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}

import {
  agreementAcceptanceInputSchema,
  agreementAcceptanceSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
export async function acknowledgeStayAgreement(
  client: ApiClient,
  stay: string,
  agreement: string,
  input: unknown,
  key: string,
) {
  const stayId = stayIdentifierSchema.parse(stay),
    agreementId = stayIdentifierSchema.parse(agreement),
    body = agreementAcceptanceInputSchema.parse(input);
  const result = await readApi(
    client.PUT('/v1/me/stays/{stayId}/agreements/{agreementId}/acceptance', {
      params: {
        path: { stayId, agreementId },
        header: { 'Idempotency-Key': stayIdentifierSchema.parse(key) },
      },
      body,
    }),
    agreementAcceptanceSchema,
  );
  if (
    result.stayId !== stayId ||
    result.agreementId !== agreementId ||
    result.agreementVersion !== body.version ||
    result.termsDigest !== body.termsDigest
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}

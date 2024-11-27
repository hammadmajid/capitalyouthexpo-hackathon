import { ApiFailure } from '@hsm/api-client';
import { ownerProfileInputSchema } from '@hsm/contracts';
import { z } from 'zod';
import { safeMessage } from './messages';
const messages: Readonly<Record<string, string>> = {
  fullName: 'Enter your full name (2–150 characters).',
  phone: 'Enter a valid Pakistani mobile number.',
  cnic: 'Enter your 13-digit CNIC number.',
  address: 'Enter your complete Owner address (at least 5 characters).',
  organizationName: 'Enter 2–150 characters for the organization, or leave it blank.',
  agreementAccepted: 'Accept the Owner agreement to save.',
  profilePhotoFileId: 'Choose a checked profile photo, or remove the selection.',
};
export function ownerProfileError(error: unknown) {
  if (error instanceof z.ZodError)
    return messages[String(error.issues[0]?.path[0])] ?? 'Check your Owner profile details.';
  if (error instanceof ApiFailure && error.code === 'CONFLICT')
    return error.problem.detail === 'Identity correction requires review'
      ? 'Name or CNIC changes require identity review in Account.'
      : 'Your profile changed or a photo is under review. Check your saved details.';
  return safeMessage(error);
}
export function ownerFieldError(name: string, value: string) {
  const shape = ownerProfileInputSchema.innerType().shape;
  const schema = shape[name as keyof typeof shape];
  if (!schema || (name === 'organizationName' && !value.trim())) return undefined;
  const result = schema.safeParse(value);
  return result.success ? undefined : messages[name];
}

import type { SchemaObject } from '@nestjs/swagger';
const password: SchemaObject = { type: 'string', minLength: 8, maxLength: 128 };
const temporaryCredential: SchemaObject = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['mode'],
      properties: { mode: { type: 'string', enum: ['auto'] } },
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['mode', 'password'],
      properties: { mode: { type: 'string', enum: ['manual'] }, password },
    },
  ],
};
export const credentialDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['temporaryCredential'],
  properties: { temporaryCredential },
};
export const invitationInputDocumentation: SchemaObject = {
  ...credentialDocumentation,
  required: ['fullName', 'phone', 'temporaryCredential'],
  properties: {
    ...credentialDocumentation.properties,
    fullName: { type: 'string', minLength: 2, maxLength: 150 },
    phone: { type: 'string', pattern: '^(?:0|\\+92|92)3\\d{9}$' },
  },
};
export const invitationResponseDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'branchId', 'status', 'expiresAt', 'acceptance'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    branchId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['pending_activation'] },
    expiresAt: { type: 'string', format: 'date-time' },
    acceptance: { type: 'string', enum: ['temporary_password', 'authenticated_account'] },
    generatedTempPassword: {
      ...password,
      description:
        'Initial successful auto-generated issuance only; absent on replay or permanent identities.',
    },
  },
};

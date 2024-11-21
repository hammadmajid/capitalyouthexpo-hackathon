import { ApiBody } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import type { z } from 'zod';
const password: SchemaObject = {
  type: 'string',
  minLength: 8,
  maxLength: 128,
  format: 'password',
  writeOnly: true,
};
const fields = new Map<string, SchemaObject>([
  ['cnicFrontFileId', { type: 'string', format: 'uuid' }],
  ['cnicBackFileId', { type: 'string', format: 'uuid' }],
  ['address', { type: 'string', minLength: 5, maxLength: 500 }],
  ['agreementAccepted', { type: 'boolean', enum: [true] }],
  ['agreementVersion', { type: 'string', enum: ['owner-foundation-v1'] }],
  ['organizationName', { type: 'string', minLength: 2, maxLength: 150 }],
  ['age', { type: 'integer', minimum: 18, maximum: 120 }],
  ['institution', { type: 'string', minLength: 2, maxLength: 200 }],
  [
    'profilePhotoFileId',
    {
      type: 'string',
      format: 'uuid',
      nullable: true,
      description:
        'Omit to preserve; null unlinks the current avatar and retains the file history.',
    },
  ],
  ['fullName', { type: 'string', minLength: 2, maxLength: 150 }],
  ['email', { type: 'string', format: 'email', maxLength: 254 }],
  ['phone', { type: 'string', pattern: '^\\+92[0-9]{10}$' }],
  ['password', password],
  ['setupToken', { type: 'string', minLength: 32, maxLength: 512, writeOnly: true }],
  ['currentPassword', password],
  ['newPassword', password],
  ['tempPassword', password],
  ['gender', { type: 'string', enum: ['male', 'female'] }],
  [
    'dateOfBirth',
    {
      type: 'string',
      format: 'date',
      description: 'Must be at least 18 in Asia/Karachi (AUTH-C-003)',
    },
  ],
  ['cnic', { type: 'string', pattern: '^(?:[0-9]{13}|[0-9]{5}-[0-9]{7}-[0-9])$', writeOnly: true }],
  [
    'identifier',
    { type: 'string', minLength: 3, maxLength: 254, description: 'Email or E.164 phone' },
  ],
  ['client', { type: 'string', enum: ['mobile', 'web'] }],
  ['code', { type: 'string', pattern: '^[0-9]{6}$', writeOnly: true }],
  [
    'refreshToken',
    {
      type: 'string',
      minLength: 32,
      maxLength: 512,
      writeOnly: true,
      description:
        'Mobile only. Web sends an empty object and protected cookies plus X-CSRF-Token.',
    },
  ],
]);
export function authRequestSchema(schema: z.AnyZodObject): SchemaObject {
  const entries = Object.entries(schema.shape) as [string, z.ZodType][];
  return {
    type: 'object',
    additionalProperties: false,
    required: entries.filter(([, field]) => !field.isOptional()).map(([name]) => name),
    properties: Object.fromEntries(
      entries.map(([name, field]) => {
        const definition = fields.get(name);
        if (!definition) throw new Error('Missing authentication field documentation: ' + name);
        const defaultValue = field.safeParse(undefined);
        return [
          name,
          {
            ...definition,
            ...(defaultValue.success && defaultValue.data !== undefined
              ? { default: defaultValue.data }
              : {}),
          },
        ];
      }),
    ),
  };
}
export const AuthInput = (schema: z.AnyZodObject) => ApiBody({ schema: authRequestSchema(schema) });

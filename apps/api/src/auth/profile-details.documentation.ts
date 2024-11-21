import type { SchemaObject } from '@nestjs/swagger';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const nullable = (schema: SchemaObject): SchemaObject => ({ anyOf: [schema, { type: 'null' }] });
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
export const profileDetailsDocumentation = object({
  userId: uuid,
  fullName: { type: 'string', maxLength: 150 },
  email: nullable({ type: 'string', format: 'email' }),
  emailVerified: { type: 'boolean' },
  phone: nullable({ type: 'string', pattern: '^\\+923[0-9]{9}$' }),
  gender: nullable({ type: 'string', enum: ['male', 'female'] }),
  cnicLast4: nullable({ type: 'string', pattern: '^[0-9]{4}$' }),
  profilePhotoFileId: nullable(uuid),
  customer: nullable(
    object({
      age: nullable({ type: 'integer', minimum: 18, maximum: 120 }),
      institution: nullable({ type: 'string', maxLength: 200 }),
      completed: { type: 'boolean' },
    }),
  ),
  owner: nullable(
    object({
      address: { type: 'string', maxLength: 500 },
      organizationName: nullable({ type: 'string', maxLength: 150 }),
      cnicFrontFileId: nullable(uuid),
      cnicBackFileId: nullable(uuid),
      agreementVersion: { type: 'string', minLength: 1, maxLength: 100 },
      agreementAcceptedAt: { type: 'string', format: 'date-time' },
      completed: { type: 'boolean' },
    }),
  ),
});

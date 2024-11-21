import { ApiHeader, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const nullable = (schema: SchemaObject): SchemaObject => ({ anyOf: [schema, { type: 'null' }] });
export const profileDocumentation = object({
  user: object({
    id: uuid,
    fullName: { type: 'string' },
    email: nullable({ type: 'string', format: 'email' }),
    emailVerified: { type: 'boolean' },
    cnicLast4: nullable({ type: 'string', minLength: 4, maxLength: 4 }),
  }),
  capabilities: object({
    customer: { type: 'boolean' },
    owner: { type: 'boolean' },
    managerOf: { type: 'array', items: object({ branchId: uuid, branchName: { type: 'string' } }) },
    admin: nullable(
      object({
        isRoot: { type: 'boolean' },
        roles: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['verification', 'support', 'content_moderator', 'billing'],
          },
        },
      }),
    ),
  }),
});
export function sessionDocumentation(profile: boolean): SchemaObject {
  const identity = profile ? (profileDocumentation.properties as Record<string, SchemaObject>) : {};
  const common = {
    expiresIn: { type: 'integer', enum: [600] } as SchemaObject,
    sessionId: uuid,
    ...identity,
  };
  return {
    oneOf: [
      object({
        ...common,
        client: { type: 'string', enum: ['mobile'] },
        accessToken: {
          type: 'string',
          description: 'Short-lived bearer credential for SecureStore',
        },
        refreshToken: { type: 'string', description: 'Rotated secret for SecureStore' },
      }),
      object({ ...common, client: { type: 'string', enum: ['web'] } }),
    ],
  };
}
export const AuthSession = (profile = true) =>
  ApiResponse({
    status: 200,
    description: 'No-store session response. Web credentials use HttpOnly cookies.',
    schema: sessionDocumentation(profile),
  });
export const AuthAck = (key: string, status = 200) =>
  ApiResponse({
    status,
    schema: object({ [key]: { type: 'boolean', enum: [true] } }),
  });
export const CookieCsrf = () =>
  ApiHeader({
    name: 'X-CSRF-Token',
    required: false,
    description:
      'Required on unsafe cookie-authenticated requests; matches the readable CSRF cookie.',
    schema: { type: 'string' },
  });

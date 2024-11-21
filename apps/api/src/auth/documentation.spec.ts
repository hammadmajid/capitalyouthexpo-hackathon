import { problemDocumentation } from './problem.documentation.js';
import { errorCodeSchema } from '@hsm/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  emailVerificationSessionSchema,
  loginSchema,
  managerActivationSchema,
  passwordChangeSchema,
  registrationSchema,
  refreshRequestSchema,
} from '@hsm/contracts';
import { authRequestSchema } from './request.documentation.js';
import { sessionDocumentation, profileDocumentation } from './response.documentation.js';
it('SEC: documentation derives strict required fields and defaults from shared auth contracts', () => {
  for (const schema of [
    registrationSchema,
    loginSchema,
    emailVerificationSessionSchema,
    managerActivationSchema,
    passwordChangeSchema,
    refreshRequestSchema,
  ]) {
    const documented = authRequestSchema(schema);
    expect(documented.additionalProperties).toBe(false);
    expect(Object.keys(documented.properties ?? {})).toEqual(Object.keys(schema.shape));
    expect(documented.required).toEqual(
      Object.entries(schema.shape)
        .filter(([, field]) => !field.isOptional())
        .map(([name]) => name),
    );
  }
  expect(authRequestSchema(emailVerificationSessionSchema).properties?.client).toMatchObject({
    default: 'mobile',
  });
  expect(authRequestSchema(passwordChangeSchema).properties?.currentPassword).toMatchObject({
    writeOnly: true,
    format: 'password',
  });
  expect(() => authRequestSchema(z.object({ undocumented: z.string() }))).toThrow(
    'Missing authentication field documentation',
  );
});
it('SEC: documented cookie responses never expose bearer secrets and self fields stay projected', () => {
  for (const profile of [true, false]) {
    const schema = sessionDocumentation(profile);
    const mobile = schema.oneOf?.[0];
    const web = schema.oneOf?.[1];
    expect(mobile).toHaveProperty('properties.accessToken');
    expect(web).not.toHaveProperty('properties.accessToken');
    expect(web).not.toHaveProperty('properties.refreshToken');
    if (profile) expect(web).toHaveProperty('properties.capabilities');
    else expect(web).not.toHaveProperty('properties.capabilities');
  }
  expect(profileDocumentation).toHaveProperty('properties.user');
  expect(JSON.stringify(profileDocumentation)).not.toContain('passwordHash');
  expect(JSON.stringify(profileDocumentation)).not.toContain('cnicEncrypted');
});

it('SEC: documented problem codes match the shared sanitized error contract', () => {
  expect(problemDocumentation.properties?.code).toMatchObject({ enum: errorCodeSchema.options });
  expect(problemDocumentation.required).toContain('traceId');
  expect(problemDocumentation.additionalProperties).toBe(false);
});

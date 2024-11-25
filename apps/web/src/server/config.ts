import { z } from 'zod';
const origin = z
  .string()
  .url()
  .refine((value) => {
    try {
      const parsed = new URL(value);
      // URL.origin excludes credentials, paths, queries and fragments.
      return ['http:', 'https:'].includes(parsed.protocol) && parsed.origin === value;
    } catch {
      return false;
    }
  }, 'Expected an HTTP origin');
const schema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    API_ORIGIN: origin.default('http://127.0.0.1:4000'),
    WEB_ORIGIN: origin.default('http://localhost:3000'),
  })
  .superRefine((value, context) => {
    if (['staging', 'production'].includes(value.APP_ENV)) {
      for (const key of ['API_ORIGIN', 'WEB_ORIGIN'] as const)
        if (!value[key].startsWith('https:'))
          context.addIssue({
            code: 'custom',
            path: [key],
            message: 'Deployed origins require HTTPS',
          });
    }
  });
export type WebConfig = z.infer<typeof schema>;
export function webConfig(input: unknown = process.env): WebConfig {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new Error(
      'Invalid web configuration: ' +
        parsed.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  return Object.freeze(parsed.data);
}

// Storage credentials and signed paths must never be copied into CSP.
export function privateUploadOrigin(input: unknown, environment: string): string | undefined {
  if (input === undefined || input === '') return undefined;
  const parsed = origin.safeParse(input);
  if (
    !parsed.success ||
    (['staging', 'production'].includes(environment) && !parsed.data.startsWith('https:'))
  )
    throw new Error('Invalid private upload origin');
  return parsed.data;
}

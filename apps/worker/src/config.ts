import { z } from 'zod';
const boolean = z.enum(['true', 'false']).transform((value) => value === 'true');
const optionalCredential = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);
const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    DATABASE_URL: z
      .string()
      .url()
      .regex(/^postgres(?:ql)?:/),
    REDIS_URL: z
      .string()
      .url()
      .regex(/^rediss?:/),
    EMAIL_ENVELOPE_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURE: boolean.default('false'),
    VISITS_ENABLED: boolean.default('true'),
    SMTP_REQUIRE_TLS: boolean.default('false'),
    SMTP_USER: optionalCredential,
    SMTP_PASSWORD: optionalCredential,
    SMTP_FROM: z.string().email(),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error', 'silent']).default('info'),
  })
  .superRefine((config, context) => {
    if (Boolean(config.SMTP_USER) !== Boolean(config.SMTP_PASSWORD))
      context.addIssue({
        code: 'custom',
        path: ['SMTP_USER'],
        message: 'SMTP credentials must be paired',
      });
    if (config.NODE_ENV === 'production' && !['staging', 'production'].includes(config.APP_ENV))
      context.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message: 'Production runtime requires explicit deployed environment',
      });
    if (
      ['staging', 'production'].includes(config.APP_ENV) &&
      (!config.SMTP_USER || (!config.SMTP_SECURE && !config.SMTP_REQUIRE_TLS))
    )
      context.addIssue({
        code: 'custom',
        path: ['SMTP_REQUIRE_TLS'],
        message: 'Authenticated encrypted SMTP required',
      });
  });
export function workerConfig(input: Record<string, unknown>) {
  if (input.CNIC_ENCRYPTION_KEY || input.CNIC_HASH_KEY)
    throw new Error('CNIC keys must not be provisioned to the worker');
  return schema.parse(input);
}
export type WorkerConfig = z.infer<typeof schema>;

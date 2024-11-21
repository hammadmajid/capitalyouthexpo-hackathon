import { z } from 'zod';
import { authKeysSchema } from './auth/crypto.js';
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    VISITS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    PROFILE_REVIEWS_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    API_PORT: z.coerce.number().int().min(0).max(65535).default(4000),
    API_HOST: z.string().default('127.0.0.1'),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => /^postgres(?:ql)?:/.test(value)),
    REDIS_URL: z
      .string()
      .url()
      .refine((value) => /^rediss?:/.test(value)),
    CORS_ORIGINS: z
      .string()
      .transform((value) => value.split(',').map((origin) => origin.trim()))
      .pipe(
        z
          .array(
            z
              .string()
              .url()
              .pipe(z.string().refine((value) => new URL(value).origin === value)),
          )
          .min(1),
      ),
    TRUST_PROXY: z
      .string()
      .default('')
      .transform((value) => (value ? value.split(',').map((ip) => ip.trim()) : false))
      .refine(
        (value) => value === false || value.every((ip) => z.string().ip().safeParse(ip).success),
      ),
    BODY_LIMIT_BYTES: z.coerce.number().int().min(256).max(1048576).default(1048576),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    AUTH_IP_RATE_LIMIT: z.coerce.number().int().min(1).max(10000).default(30),
    AUTH_IDENTIFIER_RATE_LIMIT: z.coerce.number().int().min(1).max(10000).default(5),
    MARKETPLACE_TEXT_RADIUS_METERS: z.coerce.number().int().min(100).max(200000).default(5000),
    GLOBAL_RATE_LIMIT: z.coerce.number().int().min(1).max(10000).default(120),
    CHAT_SEND_RATE_LIMIT: z.coerce.number().int().min(1).max(1000).default(30),
  })
  .and(authKeysSchema)
  .superRefine((value, context) => {
    if (value.NODE_ENV === 'production' && !['staging', 'production'].includes(value.APP_ENV))
      context.addIssue({
        code: 'custom',
        path: ['APP_ENV'],
        message: 'Production runtime requires explicit deployed environment',
      });
    if (
      ['staging', 'production'].includes(value.APP_ENV) &&
      value.CORS_ORIGINS.some((origin) => !origin.startsWith('https://'))
    )
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Deployed origins require HTTPS',
      });
  });
export type ApiConfig = z.infer<typeof environmentSchema>;
export function parseEnvironment(input: unknown): ApiConfig {
  const result = environmentSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid API configuration: ' +
        result.error.issues.map((issue) => issue.path.join('.')).join(', '),
    );
  return Object.freeze(result.data);
}

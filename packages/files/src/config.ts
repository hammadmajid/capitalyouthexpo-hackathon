import { z } from 'zod';
const endpoint = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      ['http:', 'https:'].includes(url.protocol) &&
      !url.search &&
      !url.hash
    );
  }, 'Invalid storage endpoint');
const schema = z
  .object({
    APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    S3_ENDPOINT: endpoint,
    S3_PUBLIC_ENDPOINT: endpoint.optional(),
    S3_REGION: z.string().min(1).max(100),
    S3_ACCESS_KEY_ID: z.string().min(1).max(200),
    S3_SECRET_ACCESS_KEY: z.string().min(16).max(200),
    S3_PRIVATE_BUCKET: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/),
  })
  .superRefine((value, context) => {
    if (
      ['staging', 'production'].includes(value.APP_ENV) &&
      [value.S3_ENDPOINT, value.S3_PUBLIC_ENDPOINT ?? value.S3_ENDPOINT].some(
        (url) => !url.startsWith('https:'),
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: 'Deployed storage requires HTTPS',
      });
  });
export type StorageConfig = z.infer<typeof schema>;
export function storageConfig(input: unknown) {
  return schema.parse(input);
}

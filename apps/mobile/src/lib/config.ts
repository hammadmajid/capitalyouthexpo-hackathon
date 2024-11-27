import { z } from 'zod';
export const mobileEnvironmentSchema = z.enum(['development', 'test', 'staging', 'production']);
export function validateMobileConfig(input: unknown) {
  const parsed = z
    .object({
      environment: mobileEnvironmentSchema,
      apiUrl: z.string().url(),
      webUrl: z.string().url().default('http://localhost:3000'),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success) throw new Error('Invalid public mobile configuration');
  for (const value of [parsed.data.apiUrl, parsed.data.webUrl]) {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      (['staging', 'production'].includes(parsed.data.environment) && url.protocol !== 'https:')
    )
      throw new Error('Invalid public mobile configuration');
  }
  return Object.freeze({
    ...parsed.data,
    apiUrl: new URL(parsed.data.apiUrl).origin,
    webUrl: new URL(parsed.data.webUrl).origin,
  });
}
export type MobileConfig = ReturnType<typeof validateMobileConfig>;

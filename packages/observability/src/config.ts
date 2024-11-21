import { z } from 'zod';
export const environmentSchema = z.enum(['development', 'test', 'staging', 'production']);
const schema = z
  .object({
    environment: environmentSchema,
    service: z.enum(['api', 'web', 'mobile']),
    dsn: z.string().optional(),
  })
  .strict();
export function observabilityConfig(input: unknown) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error('Invalid observability configuration');
  const { dsn } = parsed.data;
  if (dsn === undefined || dsn === '') return Object.freeze({ ...parsed.data, dsn: undefined });
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    throw new Error('Invalid observability configuration');
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const local = ['development', 'test'].includes(parsed.data.environment);
  if (
    !/^[a-f0-9]{32}$/.test(url.username) ||
    url.password ||
    !/^\/\d+$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    !(url.protocol === 'https:' || (url.protocol === 'http:' && loopback && local))
  ) {
    throw new Error('Invalid observability configuration');
  }
  return Object.freeze({ ...parsed.data, dsn: url.href });
}
export type ObservabilityConfig = ReturnType<typeof observabilityConfig>;

import { z } from 'zod';
import { errorCodeSchema } from '@hsm/contracts';
import type { LoggerOptions } from 'pino';
const messages = new Set([
  'incoming request',
  'request completed',
  'request errored',
  'Request failed',
  'API refused startup',
  'Application event',
]);
const entrySchema = z.object({
  req: z.unknown().optional(),
  res: z.unknown().optional(),
  err: z.unknown().optional(),
  code: errorCodeSchema.optional(),
  requestId: z.string().uuid().optional(),
  responseTime: z.number().finite().nonnegative().optional(),
});
const bindingSchema = z.object({
  pid: z.number().int().positive().optional(),
  reqId: z.string().uuid().optional(),
});
const requestSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
  routeOptions: z.object({ url: z.string().optional() }).optional(),
});
export const privateLogging: Pick<LoggerOptions, 'hooks' | 'formatters' | 'serializers'> = {
  hooks: {
    logMethod(args, method) {
      const candidate = typeof args[0] === 'string' ? args[0] : args[1];
      const message =
        typeof candidate === 'string' && messages.has(candidate) ? candidate : 'Application event';
      const fields = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
      method.call(this, fields, message);
    },
  },
  formatters: {
    log: (value) => {
      const parsed = entrySchema.safeParse(value);
      const omitted = Object.keys(value).some((key) => !Object.hasOwn(entrySchema.shape, key));
      return {
        ...(parsed.success ? parsed.data : {}),
        ...(!parsed.success || omitted ? { redacted: '[REDACTED]' } : {}),
      };
    },
    bindings: (value) => {
      const parsed = bindingSchema.safeParse(value);
      return parsed.success ? parsed.data : {};
    },
  },
  serializers: {
    reqId: (value: unknown) => {
      const parsed = z.string().uuid().safeParse(value);
      return parsed.success ? parsed.data : undefined;
    },
    err: () => ({ type: 'Error', message: 'Unexpected error' }),
    req: (value: unknown) => {
      const parsed = requestSchema.safeParse(value);
      return {
        method: parsed.success ? (parsed.data.method ?? 'OTHER') : 'OTHER',
        path: parsed.success ? (parsed.data.routeOptions?.url ?? 'UNMATCHED') : 'UNMATCHED',
      };
    },
    res: (value: unknown) => {
      const parsed = z.object({ statusCode: z.number().int().min(100).max(599) }).safeParse(value);
      return parsed.success ? parsed.data : {};
    },
  },
};

import { PROFILE_REVIEWS_HEADER } from '@hsm/contracts';
import { publicMarketplace } from './public-marketplace.js';
import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './generated/schema.js';
export type ClientAuthentication =
  | { kind: 'cookie'; csrf: () => string | undefined }
  | { kind: 'bearer'; accessToken: () => Promise<string | undefined> };
export interface ApiClientOptions {
  baseUrl: string;
  authentication: ClientAuthentication;
  fetch?: typeof globalThis.fetch;
}
const publicAuth = new Set([
  '/v1/auth/register',
  '/v1/auth/registration/start',
  '/v1/auth/registration/verify',
  '/v1/auth/registration/password',
  '/v1/auth/login',
  '/v1/auth/email/verify',
  '/v1/auth/email/resend',
  '/v1/auth/password/forgot',
  '/v1/auth/password/reset',
  '/v1/auth/manager/activate',
  '/v1/auth/refresh',
]);
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);
export function createApiClient(options: ApiClientOptions) {
  const client = createClient<paths>({
    baseUrl: options.baseUrl,
    credentials: options.authentication.kind === 'cookie' ? 'include' : 'omit',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const middleware: Middleware = {
    async onRequest({ request, schemaPath }) {
      request.headers.set(PROFILE_REVIEWS_HEADER, '1');
      if (options.authentication.kind === 'cookie') {
        const csrf = safeMethods.has(request.method) ? undefined : options.authentication.csrf();
        if (csrf) request.headers.set('X-CSRF-Token', csrf);
      } else if (
        !publicAuth.has(schemaPath) &&
        !schemaPath.startsWith('/v1/health/') &&
        !publicMarketplace(request.method, schemaPath)
      ) {
        const access = await options.authentication.accessToken();
        if (access) request.headers.set('Authorization', 'Bearer ' + access);
      }
      return request;
    },
  };
  client.use(middleware);
  return client;
}
export type ApiClient = ReturnType<typeof createApiClient>;

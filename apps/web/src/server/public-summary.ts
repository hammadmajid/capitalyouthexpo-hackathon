import { createApiClient, readPublicHostelSummary } from '@hsm/api-client';
import { webConfig, type WebConfig } from './config';
export function loadPublicHostelSummary(
  branchId: string,
  query: unknown = {},
  transport: typeof fetch = fetch,
  config: WebConfig = webConfig(),
) {
  const client = createApiClient({
    baseUrl: config.API_ORIGIN,
    authentication: { kind: 'bearer', accessToken: async () => undefined },
    fetch: (input, init) =>
      transport(input, {
        ...init,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      }),
  });
  return readPublicHostelSummary(client, branchId, query);
}

import { BrowserClient, defaultStackParser, makeFetchTransport } from '@sentry/browser';
import {
  observabilityConfig,
  privateEnvelope,
  privateException,
  safeReport,
} from '@hsm/observability';
const eventId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
export function browserTelemetry(input: unknown) {
  const config = observabilityConfig(input);
  const client = config.dsn
    ? new BrowserClient({
        dsn: config.dsn,
        environment: config.environment,
        transport: makeFetchTransport,
        transportOptions: { fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' } },
        stackParser: defaultStackParser,
        sendClientReports: false,
        debug: false,
        dataCollection: {
          userInfo: false,
          cookies: false,
          httpHeaders: false,
          httpBodies: [],
          urlQueryParams: false,
          graphQL: { document: false, variables: false },
          genAI: { inputs: false, outputs: false },
          databaseQueryData: false,
          queues: false,
          stackFrameVariables: false,
          frameContextLines: 0,
        },
        beforeSend: () => ({ ...privateException(config, eventId()), type: undefined }),
        beforeSendLog: () => null,
        beforeSendMetric: () => null,
        traceLifecycle: 'static',
        beforeSendTransaction: () => null,
        integrations: [
          {
            name: 'HsmPrivateEnvelope',
            setup(target) {
              target.on('beforeEnvelope', (envelope) => {
                const safe = privateEnvelope(envelope, config, eventId());
                envelope[0] = safe.headers;
                envelope[1] = safe.items;
              });
            },
          },
        ],
      })
    : undefined;
  client?.init();
  return {
    client,
    report: safeReport(() => client?.captureEvent(privateException(config, eventId()))),
    flush: () => Promise.resolve(client?.flush(1500) ?? true).catch(() => false),
    close: () => Promise.resolve(client?.close(1500) ?? true).catch(() => false),
  };
}

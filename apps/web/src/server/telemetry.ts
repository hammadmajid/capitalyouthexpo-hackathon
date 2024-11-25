import { randomUUID } from 'node:crypto';
import * as Sentry from '@sentry/node';
import {
  observabilityConfig,
  privateEnvelope,
  privateException,
  safeReport,
} from '@hsm/observability';
const eventId = () => randomUUID().replaceAll('-', '');
export function webTelemetry(input: unknown) {
  const config = observabilityConfig(input);
  const client = config.dsn
    ? Sentry.init({
        dsn: config.dsn,
        environment: config.environment,
        defaultIntegrations: false,
        enableOpenTelemetrySetup: false,
        enableRuntimeChannelInjection: false,
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
  return {
    client,
    report: safeReport(() => client?.captureEvent(privateException(config, eventId()))),
    flush: () => Promise.resolve(client?.flush(1500) ?? true).catch(() => false),
    close: () => Promise.resolve(client?.close(1500) ?? true).catch(() => false),
  };
}

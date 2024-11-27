import { defaultStackParser, makeFetchTransport } from '@sentry/browser';
import { uuid4, type Envelope, type Integration } from '@sentry/core';
import { ReactNativeClient } from '@sentry/react-native';
import {
  observabilityConfig,
  privateEnvelope,
  privateException,
  safeReport,
} from '@hsm/observability';
export function mobileTelemetry(input: unknown) {
  const config = observabilityConfig(input);
  const guard: Integration = {
    name: 'HsmPrivateEnvelope',
    setup(target) {
      target.on('beforeEnvelope', (envelope: Envelope) => {
        const safe = privateEnvelope(envelope, config, uuid4());
        envelope[0] = safe.headers;
        envelope[1] = safe.items;
      });
    },
  };
  const client = config.dsn
    ? new ReactNativeClient({
        dsn: config.dsn,
        environment: config.environment,
        transport: makeFetchTransport,
        transportOptions: { fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' } },
        stackParser: defaultStackParser,
        integrations: [guard],
        enableNative: false,
        enableNativeCrashHandling: false,
        autoInitializeNativeSdk: false,
        enableNativeNagger: false,
        enableAutoSessionTracking: false,
        enableAutoPerformanceTracing: false,
        enableNdk: false,
        enableNdkScopeSync: false,
        attachThreads: false,
        sendDefaultPii: false,
        enableWatchdogTerminationTracking: false,
        patchGlobalPromise: false,
        enableAppHangTracking: false,
        enableCaptureFailedRequests: false,
        enableAppStartTracking: false,
        enableNativeFramesTracking: false,
        enableStallTracking: false,
        enableUserInteractionTracing: false,
        attachScreenshot: false,
        attachViewHierarchy: false,
        attachStacktrace: false,
        enableLogs: false,
        sendClientReports: false,
        debug: false,
        beforeSend: () => ({ ...privateException(config, uuid4()), type: undefined }),
        beforeBreadcrumb: () => null,
        beforeSendLog: () => null,
        beforeSendTransaction: () => null,
      })
    : undefined;
  client?.init();
  return {
    client,
    report: safeReport(() => client?.captureEvent(privateException(config, uuid4()))),
    flush: () => Promise.resolve(client?.flush(1500) ?? true).catch(() => false),
    close: () => Promise.resolve(client?.close() ?? true).catch(() => false),
  };
}

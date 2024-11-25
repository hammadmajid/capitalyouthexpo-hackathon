import { safeReport } from '@hsm/observability';
import { browserTelemetry } from './telemetry';
let telemetry: ReturnType<typeof browserTelemetry> | undefined;
export function initializeBrowserTelemetry() {
  if (typeof window === 'undefined' || telemetry) return;
  telemetry = browserTelemetry({
    environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'development',
    service: 'web',
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });
}
export const reportBrowserFailure = safeReport(() => {
  initializeBrowserTelemetry();
  telemetry?.report();
});

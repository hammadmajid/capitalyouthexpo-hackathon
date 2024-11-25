import { observabilityConfig } from '@hsm/observability';
import { reportWebFailure } from './server/telemetry-reporter';
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { webConfig } = await import('./server/config');
    const { webTelemetry } = await import('./server/telemetry');
    const { installWebReporter } = await import('./server/telemetry-reporter');
    const config = webConfig();
    observabilityConfig({
      environment: config.APP_ENV,
      service: 'web',
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    });
    const telemetry = webTelemetry({
      environment: config.APP_ENV,
      service: 'web',
      dsn: process.env.SENTRY_DSN,
    });
    installWebReporter(telemetry.report);
  }
}
export function onRequestError() {
  // SEC-003: ignore framework request, context and exception arguments entirely.
  reportWebFailure();
}

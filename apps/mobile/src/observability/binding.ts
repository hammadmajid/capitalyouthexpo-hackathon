import { telemetryRuntime } from './runtime';
const telemetry = telemetryRuntime(
  {
    service: 'mobile',
    environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  },
  async (config) => (await import('./sdk')).mobileTelemetry(config),
);
export const initializeMobileTelemetry = telemetry.initialize;
export const reportMobileFailure = telemetry.report;

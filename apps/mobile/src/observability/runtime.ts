import { observabilityConfig, type ObservabilityConfig } from '@hsm/observability';
interface Reporter {
  report(): void;
}
type Loader = (config: ObservabilityConfig) => Promise<Reporter>;
// SEC-003: a disabled collector does not load the native SDK or delay authentication.
export function telemetryRuntime(input: unknown, load: Loader) {
  let config: ObservabilityConfig;
  try {
    config = observabilityConfig(input);
  } catch {
    // Invalid optional telemetry stays disabled; never fall back to an unsafe collector.
    return { initialize: () => undefined, report: () => undefined };
  }
  let pending: Promise<Reporter | undefined> | undefined;
  const initialize = () => {
    if (!pending)
      pending = config.dsn
        ? Promise.resolve()
            .then(() => load(config))
            .catch(() => undefined)
        : Promise.resolve(undefined);
    return pending;
  };
  return {
    initialize: () => {
      void initialize();
    },
    report: () => {
      void initialize()
        .then((reporter) => reporter?.report())
        .catch(() => undefined);
    },
  };
}

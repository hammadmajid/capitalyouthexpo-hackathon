import { describe, expect, it, vi } from 'vitest';
import { telemetryRuntime } from './runtime';
const config = {
  service: 'mobile',
  environment: 'test',
  dsn: 'http://' + 'a'.repeat(32) + '@localhost/1',
};
const drain = async () => {
  for (let index = 0; index < 10; index++) await Promise.resolve();
};
describe('SEC-003: optional mobile telemetry', () => {
  it('does not load a disabled SDK', async () => {
    const load = vi.fn();
    const runtime = telemetryRuntime({ ...config, dsn: '' }, load);
    runtime.initialize();
    runtime.initialize();
    runtime.report();
    await drain();
    expect(load).not.toHaveBeenCalled();
  });
  it('initializes once and reports fixed failures without arguments', async () => {
    const report = vi.fn();
    const load = vi.fn(async () => ({ report }));
    const runtime = telemetryRuntime(config, load);
    runtime.initialize();
    runtime.initialize();
    runtime.report();
    await drain();
    runtime.report();
    await drain();
    expect(load).toHaveBeenCalledTimes(1);
    expect(report.mock.calls).toEqual([[], []]);
  });
  it('contains asynchronous initialization failure', async () => {
    const runtime = telemetryRuntime(config, async () => {
      throw new Error('Private provider failure');
    });
    expect(runtime.initialize).not.toThrow();
    expect(runtime.report).not.toThrow();
    await drain();
  });
  it('contains reporting failure', async () => {
    const runtime = telemetryRuntime(config, async () => ({
      report() {
        throw new Error('Private failure');
      },
    }));
    runtime.report();
    await drain();
  });
});

it.each(['invalid-collector', 'http://unsafe.example.test/1'])(
  'SEC-003: invalid optional collector %s cannot interrupt app initialization',
  async (dsn) => {
    const load = vi.fn();
    expect(() => {
      const runtime = telemetryRuntime({ ...config, dsn }, load);
      runtime.initialize();
      runtime.report();
    }).not.toThrow();
    await drain();
    expect(load).not.toHaveBeenCalled();
  },
);

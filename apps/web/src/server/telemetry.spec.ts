import { Scope, logger, metrics } from '@sentry/node';
// @vitest-environment node
import { expect, it } from 'vitest';
import { telemetryCollector } from '../../test/telemetry-collector';
import { webTelemetry } from './telemetry';
import { installWebReporter, reportWebFailure } from './telemetry-reporter';
it('SEC-003: optional server telemetry makes no requests', async () => {
  const telemetry = webTelemetry({ environment: 'test', service: 'web' });
  expect(telemetry.client).toBeUndefined();
  expect(telemetry.report()).toBeUndefined();
  expect(await telemetry.flush()).toBe(true);
  expect(await telemetry.close()).toBe(true);
});
it('SEC-003: real server collector rejection leaves reporting safe and private', async () => {
  const collector = await telemetryCollector(503);
  const telemetry = webTelemetry({ environment: 'test', service: 'web', dsn: collector.dsn });
  const reset = installWebReporter(telemetry.report);
  try {
    expect(reportWebFailure()).toBeUndefined();
    await telemetry.flush();
    expect(collector.bodies).toHaveLength(1);
    expect(JSON.parse(collector.bodies[0]?.split('\n')[2] ?? 'null')).toMatchObject({
      tags: { service: 'web', code: 'INTERNAL' },
      exception: {
        values: [{ type: 'ApplicationFailure', value: 'Unexpected application failure' }],
      },
    });
    const scope = new Scope();
    scope.setClient(telemetry.client);
    logger.info('PRIVATE-log', { proof: 'PRIVATE-proof' }, { scope });
    metrics.count('PRIVATE-metric', 1, { scope, attributes: { proof: 'PRIVATE-proof' } });
    telemetry.client?.captureEvent({
      type: 'transaction',
      transaction: 'PRIVATE-transaction',
      start_timestamp: 1,
      timestamp: 2,
      spans: [],
    });
    await telemetry.flush();
    expect(collector.bodies).toHaveLength(1);
    await collector.close();
    expect(reportWebFailure()).toBeUndefined();
    await telemetry.flush();
  } finally {
    reset();
    await telemetry.close();
    await collector.close();
  }
});

it.each(['flush', 'close'] as const)(
  'SEC-003: real SDK %s hook failure remains contained',
  async (hook) => {
    const collector = await telemetryCollector();
    const telemetry = webTelemetry({ environment: 'test', service: 'web', dsn: collector.dsn });
    const failure = () => {
      throw new Error('PRIVATE-provider-lifecycle');
    };
    const unsubscribe =
      hook === 'flush'
        ? telemetry.client?.on('flush', failure)
        : telemetry.client?.on('close', failure);
    try {
      expect(await telemetry[hook]()).toBe(false);
      expect(collector.bodies).toHaveLength(0);
    } finally {
      unsubscribe?.();
      await telemetry.close();
      await collector.close();
    }
  },
);

import { Scope, logger, metrics } from '@sentry/node';
// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => vi.restoreAllMocks());
import { telemetryCollector } from '../../test/telemetry-collector';
import { browserTelemetry } from './telemetry';
it('SEC-003: optional browser reporting creates no SDK or requests', async () => {
  const telemetry = browserTelemetry({ environment: 'test', service: 'web' });
  expect(telemetry.client).toBeUndefined();
  expect(telemetry.report()).toBeUndefined();
  expect(await telemetry.flush()).toBe(true);
  expect(await telemetry.close()).toBe(true);
});
it('SEC-003: real browser SDK transport strips private events, attachments and direct sends', async () => {
  const collector = await telemetryCollector();
  const actualFetch = globalThis.fetch;
  const requests: {
    credentials: RequestCredentials | undefined;
    referrerPolicy: ReferrerPolicy | undefined;
  }[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
    requests.push({ credentials: options?.credentials, referrerPolicy: options?.referrerPolicy });
    return actualFetch(input, options);
  });
  const telemetry = browserTelemetry({ environment: 'test', service: 'web', dsn: collector.dsn });
  const privateValue = 'PRIVATE-password-otp-refresh-cnic-phone-proof';
  const originalId = 'f'.repeat(32);
  const event = {
    event_id: originalId,
    message: privateValue,
    user: { id: privateValue },
    request: { headers: { Authorization: privateValue }, data: privateValue },
    extra: { secret: privateValue },
    exception: {
      values: [{ value: privateValue, stacktrace: { frames: [{ filename: privateValue }] } }],
    },
  };
  const hint = { attachments: [{ filename: privateValue, data: privateValue }] };
  try {
    expect(telemetry.client).toBeDefined();
    telemetry.client?.captureEvent(event, hint);
    expect(await telemetry.flush()).toBe(true);
    telemetry.client?.sendEvent(event, hint);
    expect(await telemetry.flush()).toBe(true);
    const scope = new Scope();
    scope.setClient(telemetry.client);
    logger.info('PRIVATE-log', { proof: 'PRIVATE-proof' }, { scope });
    metrics.count('PRIVATE-metric', 1, { scope, attributes: { proof: 'PRIVATE-proof' } });
    telemetry.client?.captureEvent({
      type: 'transaction',
      transaction: privateValue,
      start_timestamp: 1,
      timestamp: 2,
      spans: [],
    });
    expect(await telemetry.flush()).toBe(true);
    expect(collector.bodies).toHaveLength(2);
    expect(requests).toEqual([
      { credentials: 'omit', referrerPolicy: 'no-referrer' },
      { credentials: 'omit', referrerPolicy: 'no-referrer' },
    ]);
    for (const body of collector.bodies) {
      expect(body).not.toContain(privateValue);
      expect(body).not.toContain(originalId);
      const lines = body.split('\n');
      expect(lines).toHaveLength(3);
      expect(JSON.parse(lines[0] ?? 'null')).toEqual({
        event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
        sent_at: expect.any(String),
      });
      expect(JSON.parse(lines[1] ?? 'null')).toEqual({ type: 'event' });
      expect(JSON.parse(lines[2] ?? 'null')).toEqual({
        event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
        environment: 'test',
        level: 'error',
        platform: 'javascript',
        tags: { service: 'web', code: 'INTERNAL' },
        exception: {
          values: [{ type: 'ApplicationFailure', value: 'Unexpected application failure' }],
        },
        fingerprint: ['hsm', 'web', 'INTERNAL'],
      });
    }
  } finally {
    await telemetry.close();
    await collector.close();
  }
});
it('SEC-003: browser collector rejection and lost connection do not escape reporting', async () => {
  const collector = await telemetryCollector(503);
  const telemetry = browserTelemetry({ environment: 'test', service: 'web', dsn: collector.dsn });
  try {
    expect(telemetry.report()).toBeUndefined();
    await telemetry.flush();
    expect(collector.bodies).toHaveLength(1);
    await collector.close();
    expect(telemetry.report()).toBeUndefined();
    await telemetry.flush();
  } finally {
    await telemetry.close();
    await collector.close();
  }
});

it.each(['flush', 'close'] as const)(
  'SEC-003: real SDK %s hook failure remains contained',
  async (hook) => {
    const collector = await telemetryCollector();
    const telemetry = browserTelemetry({ environment: 'test', service: 'web', dsn: collector.dsn });
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

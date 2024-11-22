import { z } from 'zod';
import { expect, it } from 'vitest';
import { telemetryCollector } from '../../test/telemetry-collector.js';
import { apiTelemetry } from './sdk.js';
it('SEC-003: absent telemetry remains optional and does not send requests', async () => {
  const telemetry = apiTelemetry({ environment: 'test', service: 'api' });
  expect(telemetry.client).toBeUndefined();
  expect(telemetry.report()).toBeUndefined();
  expect(await telemetry.flush()).toBe(true);
  expect(await telemetry.close()).toBe(true);
});
it('SEC-003: actual SDK wire excludes private events, attachments and processing bypasses', async () => {
  const collector = await telemetryCollector();
  const telemetry = apiTelemetry({ environment: 'test', service: 'api', dsn: collector.dsn });
  const privateValue = 'private-password-otp-token-cnic-phone-proof';
  const privateIdentifier = 'f'.repeat(32);
  const event = {
    event_id: privateIdentifier,
    message: privateValue,
    level: 'error' as const,
    user: { id: privateValue, email: privateValue },
    request: {
      url: 'https://example.test/' + privateValue,
      headers: { authorization: privateValue },
      data: privateValue,
    },
    extra: { password: privateValue },
    tags: { identity: privateValue },
    contexts: { identity: { value: privateValue } },
    breadcrumbs: [{ message: privateValue }],
    exception: {
      values: [
        {
          type: privateValue,
          value: privateValue,
          stacktrace: { frames: [{ filename: privateValue, function: privateValue }] },
        },
      ],
    },
  };
  try {
    expect(telemetry.client).toBeDefined();
    telemetry.client?.captureEvent(event, {
      attachments: [{ filename: privateValue, data: privateValue }],
    });
    expect(await telemetry.flush()).toBe(true);
    // sendEvent bypasses beforeSend; internal SDK failures use the same final envelope path.
    telemetry.client?.sendEvent(event, {
      attachments: [{ filename: privateValue, data: privateValue }],
    });
    expect(await telemetry.flush()).toBe(true);
    expect(collector.bodies).toHaveLength(2);
    for (const body of collector.bodies) {
      expect(body).not.toContain(privateValue);
      expect(body).not.toContain(privateIdentifier);
      const lines = body.split('\n');
      expect(lines).toHaveLength(3);
      const header: unknown = JSON.parse(lines[0] ?? 'null');
      expect(header).toEqual({
        event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
        sent_at: expect.any(String),
      });
      expect(JSON.parse(lines[1] ?? 'null')).toEqual({ type: 'event' });
      const payload: unknown = JSON.parse(lines[2] ?? 'null');
      expect(payload).toMatchObject({
        environment: 'test',
        tags: { service: 'api', code: 'INTERNAL' },
        exception: {
          values: [{ type: 'ApplicationFailure', value: 'Unexpected application failure' }],
        },
      });
      expect(Object.keys(z.record(z.unknown()).parse(payload)).sort()).toEqual([
        'environment',
        'event_id',
        'exception',
        'fingerprint',
        'level',
        'platform',
        'tags',
      ]);
    }
  } finally {
    await telemetry.close();
    await collector.close();
  }
});
it('SEC-003: real provider rejection and connection loss do not escape reporting', async () => {
  const collector = await telemetryCollector(503);
  const telemetry = apiTelemetry({ environment: 'test', service: 'api', dsn: collector.dsn });
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

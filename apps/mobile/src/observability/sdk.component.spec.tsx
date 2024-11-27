/// <reference types="jest" />
import { performance } from 'node:perf_hooks';
import { ReadableStream, WritableStream, TransformStream } from 'node:stream/web';

import { Scope } from '@sentry/core';
import { mobileTelemetry } from './sdk';
import { telemetryCollector } from './__fixtures__/collector';
const config = { service: 'mobile', environment: 'test' };
const transportPrivacy: { credentials: string | undefined; referrerPolicy: string | undefined }[] =
  [];
beforeEach(() => {
  transportPrivacy.length = 0;
});
const originalFetch = globalThis.fetch;
const originalPerformance = globalThis.performance;
let dispatcher: import('undici').Agent;
const originalStreams = {
  ReadableStream: globalThis.ReadableStream,
  WritableStream: globalThis.WritableStream,
  TransformStream: globalThis.TransformStream,
};
beforeAll(() => {
  Object.assign(globalThis, { ReadableStream, WritableStream, TransformStream, performance });
  const { fetch: actualFetch, Agent } = jest.requireActual<typeof import('undici')>('undici');
  dispatcher = new Agent();
  const realFetch: typeof actualFetch = (input, options) => {
    transportPrivacy.push({
      credentials: options?.credentials,
      referrerPolicy: options?.referrerPolicy,
    });
    return actualFetch(input, { ...options, dispatcher });
  };
  globalThis.fetch = realFetch as unknown as typeof fetch;
});
afterAll(async () => {
  await dispatcher.close();
  globalThis.fetch = originalFetch;
  Object.assign(globalThis, originalStreams, { performance: originalPerformance });
});
test('SEC-003: disabled mobile collector remains inert', async () => {
  const telemetry = mobileTelemetry(config);
  expect(telemetry.client).toBeUndefined();
  expect(telemetry.report).not.toThrow();
  expect(await telemetry.flush()).toBe(true);
  expect(await telemetry.close()).toBe(true);
});
test('SEC-003: real mobile SDK sends only fixed private envelopes over HTTP', async () => {
  const collector = await telemetryCollector();
  const telemetry = mobileTelemetry({ ...config, dsn: collector.dsn });
  try {
    const client = telemetry.client;
    expect(client).toBeDefined();
    const scope = new Scope();
    scope.setClient(client);
    scope.setUser({ email: 'private@example.test' });
    scope.setExtra('refresh', 'private-refresh');
    scope.addAttachment({ filename: 'private.txt', data: 'private-file' });
    client?.captureEvent(
      { message: 'private-message', request: { url: 'https://private.test?otp=private-otp' } },
      {},
      scope,
    );
    await telemetry.flush();
    expect(collector.bodies).toHaveLength(1);
    const wire = collector.bodies[0] ?? '';
    expect(wire).not.toMatch(/private-|private@|attachment|sdk|request|contexts|user/);
    const lines = wire
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as unknown);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toEqual({ type: 'event' });
    expect(lines[2]).toEqual(
      expect.objectContaining({ tags: { service: 'mobile', code: 'INTERNAL' } }),
    );
    expect(client?.getOptions().enableNative).toBe(false);
    expect(client?.getOptions().integrations).toHaveLength(1);
  } finally {
    await telemetry.close();
    await collector.close();
  }
});
test('SEC-003: provider rejection and connection loss cannot break the app', async () => {
  const collector = await telemetryCollector(503);
  const telemetry = mobileTelemetry({ ...config, dsn: collector.dsn });
  try {
    expect(telemetry.report).not.toThrow();
    await telemetry.flush();
    expect(collector.bodies).toHaveLength(1);
    await collector.close();
    expect(telemetry.report).not.toThrow();
    expect(typeof (await telemetry.flush())).toBe('boolean');
  } finally {
    await telemetry.close();
    await collector.close();
  }
});

test('SEC-003: direct mobile SDK sends cannot bypass the final privacy envelope', async () => {
  const collector = await telemetryCollector();
  const telemetry = mobileTelemetry({ ...config, dsn: collector.dsn });
  const privateValue = 'private-password-otp-refresh-cnic-proof';
  const originalId = 'f'.repeat(32);
  try {
    telemetry.client?.sendEvent(
      {
        event_id: originalId,
        message: privateValue,
        user: { email: privateValue },
        request: { url: 'https://private.test/' + privateValue },
        breadcrumbs: [{ message: privateValue }],
        extra: { proof: privateValue },
      },
      { attachments: [{ filename: privateValue, data: privateValue }] },
    );
    expect(await telemetry.flush()).toBe(true);
    telemetry.client?.captureEvent({
      type: 'transaction',
      transaction: privateValue,
      start_timestamp: 1,
      timestamp: 2,
      spans: [],
    });
    expect(await telemetry.flush()).toBe(true);
    expect(collector.bodies).toHaveLength(1);
    const wire = collector.bodies[0] ?? '';
    expect(wire).not.toContain(privateValue);
    expect(wire).not.toContain(originalId);
    const lines = wire.trim().split('\n');
    expect(lines).toHaveLength(3);
    const header: unknown = JSON.parse(lines[0] ?? 'null');
    const payload: unknown = JSON.parse(lines[2] ?? 'null');
    expect(header).toEqual({
      event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      sent_at: expect.any(String),
    });
    expect(payload).toEqual({
      event_id: expect.stringMatching(/^[a-f0-9]{32}$/),
      environment: 'test',
      level: 'error',
      platform: 'javascript',
      tags: { service: 'mobile', code: 'INTERNAL' },
      exception: {
        values: [{ type: 'ApplicationFailure', value: 'Unexpected application failure' }],
      },
      fingerprint: ['hsm', 'mobile', 'INTERNAL'],
    });
    expect(transportPrivacy).toEqual([{ credentials: 'omit', referrerPolicy: 'no-referrer' }]);
  } finally {
    await telemetry.close();
    await collector.close();
  }
});

test('SEC-003: unexpected SDK lifecycle failures do not escape the reporting adapter', async () => {
  const collector = await telemetryCollector();
  const telemetry = mobileTelemetry({ ...config, dsn: collector.dsn });
  try {
    const client = telemetry.client;
    if (!client) throw new Error('Expected configured SDK');
    jest.spyOn(client, 'captureEvent').mockImplementation(() => {
      throw new Error('Private SDK failure');
    });
    expect(telemetry.report).not.toThrow();
    jest.spyOn(client, 'flush').mockRejectedValueOnce(new Error('Private transport failure'));
    expect(await telemetry.flush()).toBe(false);
    jest.spyOn(client, 'close').mockRejectedValueOnce(new Error('Private close failure'));
    expect(await telemetry.close()).toBe(false);
    expect(collector.bodies).toHaveLength(0);
  } finally {
    jest.restoreAllMocks();
    await telemetry.close();
    await collector.close();
  }
});

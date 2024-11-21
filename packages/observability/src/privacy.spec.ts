import { expect, it } from 'vitest';
import { observabilityConfig, privateEnvelope, privateException } from './index.js';
const config = observabilityConfig({ environment: 'test', service: 'api' });
const eventId = 'b'.repeat(32);
const privateValue = 'private-password-otp-token-cnic-phone-proof';
it('SEC-003: final telemetry excludes events, raw exceptions, hints and envelope metadata', () => {
  const original = [
    { event_id: privateValue, trace: privateValue, sdk: privateValue },
    [
      [
        { type: 'event' },
        {
          message: privateValue,
          user: privateValue,
          request: privateValue,
          exception: { values: [{ value: privateValue, stacktrace: privateValue }] },
          extra: privateValue,
          breadcrumbs: privateValue,
          tags: privateValue,
          contexts: privateValue,
        },
      ],
      [{ type: 'attachment', filename: privateValue }, privateValue],
      [{ type: 'session' }, privateValue],
      [{ type: 'transaction' }, privateValue],
      [{ type: 'log' }, privateValue],
      [{ type: 'replay_event' }, privateValue],
    ],
  ];
  const result = privateEnvelope(original, config, eventId);
  expect(result.items).toEqual([[{ type: 'event' }, privateException(config, eventId)]]);
  expect(result.headers).toEqual({ event_id: eventId, sent_at: expect.any(String) });
  expect(JSON.stringify(result)).not.toContain(privateValue);
  expect(JSON.stringify(original)).toContain(privateValue);
});
it('SEC-003: serialized SDK event bodies are never parsed or copied', () => {
  const result = privateEnvelope([{}, [[{ type: 'event' }, privateValue]]], config, eventId);
  expect(result.items).toHaveLength(1);
  expect(JSON.stringify(result)).not.toContain(privateValue);
});
it.each([
  null,
  {},
  [privateValue],
  [{}, [[{ type: 'attachment' }, privateValue]]],
  [{}, [[{ type: 'event' }]]],
])('SEC-003: malformed or non-error envelopes cannot disclose private contents', (original) => {
  const result = privateEnvelope(original, config, eventId);
  expect(result.items).toEqual([]);
  expect(JSON.stringify(result)).not.toContain(privateValue);
});
it('SEC-003: untrusted telemetry identifiers cannot become envelope headers', () => {
  expect(() => privateException(config, privateValue)).toThrow('Invalid telemetry identifier');
});

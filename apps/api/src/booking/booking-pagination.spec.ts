import { expect, it } from 'vitest';
import { HEADERS_METADATA } from '@nestjs/common/constants.js';
import { BookingController } from './controller.js';
import { BookingActionController } from './actions.controller.js';
it.each([
  ['Customer', BookingController],
  ['Branch', BookingActionController],
] as const)(
  'BKG-001 / SEC-003: %s declares bounded booking pagination for generated clients',
  (_name, controller) => {
    const parameters: unknown = Reflect.getMetadata(
      'swagger/apiParameters',
      controller.prototype.list,
    );
    expect(parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'cursor',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'string', format: 'uuid' }),
        }),
        expect.objectContaining({
          name: 'limit',
          in: 'query',
          required: false,
          schema: expect.objectContaining({ type: 'integer', minimum: 1, maximum: 100 }),
        }),
      ]),
    );
  },
);
it.each([
  ['Customer', BookingController],
  ['Branch', BookingActionController],
] as const)('SEC-003: %s makes private booking history non-cacheable', (_name, controller) => {
  const headers: unknown = Reflect.getMetadata(HEADERS_METADATA, controller.prototype.list);
  expect(headers).toEqual(expect.arrayContaining([{ name: 'Cache-Control', value: 'no-store' }]));
});

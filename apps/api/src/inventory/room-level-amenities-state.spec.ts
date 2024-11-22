import { expect, it } from 'vitest';
import { roomLevelAmenitiesInputSchema } from '@hsm/contracts';
import { projectRoomLevelAmenities } from './room-level-amenities-state.js';
const ids = {
  branchId: '019a1234-1234-7123-8123-000000000001',
  roomId: '019a1234-1234-7123-8123-000000000002',
  roomTypeId: '019a1234-1234-7123-8123-000000000003',
};
const wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true };
const bath = { code: 'attached_bath', name: 'Attached bathroom', isActive: true };
it('ROOM-AMN v2.15: an inheriting room shows exactly its room-type amenities', () => {
  const state = projectRoomLevelAmenities({
    ...ids,
    customized: false,
    own: [bath],
    type: [wifi],
    canEdit: true,
  });
  expect(state.amenities).toEqual([wifi]);
  expect(state.typeAmenities).toEqual([wifi]);
  expect(state.customized).toBe(false);
});
it('ROOM-AMN v2.15: a customized room uses only its own sorted set, which may be empty', () => {
  const custom = projectRoomLevelAmenities({
    ...ids,
    customized: true,
    own: [wifi, bath],
    type: [wifi],
    canEdit: true,
  });
  expect(custom.amenities.map((row) => row.code)).toEqual(['attached_bath', 'wifi']);
  const none = projectRoomLevelAmenities({
    ...ids,
    customized: true,
    own: [],
    type: [wifi],
    canEdit: false,
  });
  expect(none.amenities).toEqual([]);
  expect(none.version).not.toBe(custom.version);
});
it('ROOM-AMN SEC: version changes with any visible field so stale If-Match is rejected', () => {
  const base = { ...ids, customized: true, own: [wifi], type: [], canEdit: true };
  const a = projectRoomLevelAmenities(base);
  expect(projectRoomLevelAmenities(base).version).toBe(a.version);
  expect(projectRoomLevelAmenities({ ...base, own: [bath] }).version).not.toBe(a.version);
  expect(projectRoomLevelAmenities({ ...base, customized: false }).version).not.toBe(a.version);
});
it('ROOM-AMN: input accepts inherit or custom codes only, strictly', () => {
  expect(roomLevelAmenitiesInputSchema.parse({ mode: 'inherit' })).toEqual({ mode: 'inherit' });
  expect(roomLevelAmenitiesInputSchema.parse({ mode: 'custom', amenityCodes: ['wifi'] })).toEqual({
    mode: 'custom',
    amenityCodes: ['wifi'],
  });
  expect(
    roomLevelAmenitiesInputSchema.safeParse({ mode: 'inherit', amenityCodes: [] }).success,
  ).toBe(false);
  expect(
    roomLevelAmenitiesInputSchema.safeParse({ mode: 'custom', amenityCodes: ['wifi', 'wifi'] })
      .success,
  ).toBe(false);
  expect(
    roomLevelAmenitiesInputSchema.safeParse({ mode: 'custom', amenityCodes: ['Bad Code'] }).success,
  ).toBe(false);
});

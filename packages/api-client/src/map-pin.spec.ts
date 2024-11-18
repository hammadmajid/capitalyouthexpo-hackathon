import { expect, it } from 'vitest';
import { mapPinFromFields, readMapPin } from './map-pin.js';
it('ONB-001: valid coordinates preserve longitude and latitude order', () => {
  expect(readMapPin(73.04, 33.7)).toEqual({ longitude: 73.04, latitude: 33.7 });
  expect(mapPinFromFields({ longitude: ' 73.04 ', latitude: '33.7' })).toEqual(
    readMapPin(73.04, 33.7),
  );
  expect(readMapPin(-180, -90)).toEqual({ longitude: -180, latitude: -90 });
  expect(readMapPin(180, 90)).toEqual({ longitude: 180, latitude: 90 });
});
it.each([
  [181, 0],
  [0, 91],
  [-181, 0],
  [0, -91],
  [NaN, 0],
  [0, Infinity],
  ['73', 33],
  [null, null],
])('ONB-001 SEC: invalid map events cannot update coordinates (%j)', (longitude, latitude) => {
  expect(readMapPin(longitude, latitude)).toBeUndefined();
});
it.each([
  {},
  { longitude: '', latitude: '33' },
  { longitude: '73', latitude: ' ' },
  { longitude: 'wrong', latitude: '33' },
  { latitude: '33' },
])(
  'ONB-001: missing or malformed manual coordinates never save the default map center (%j)',
  (values) => {
    expect(mapPinFromFields(values)).toBeUndefined();
  },
);

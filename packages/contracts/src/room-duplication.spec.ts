import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  duplicationRoomNumbers,
  roomDuplicationInputSchema,
  roomDuplicationResultSchema,
} from './room-duplication.js';
it('PROP-001 / ROOM-002: explicit labels and bounded ascending ranges are deterministic', () => {
  expect(
    duplicationRoomNumbers(roomDuplicationInputSchema.parse({ roomNumbers: [' 201 ', '202A'] })),
  ).toEqual(['201', '202A']);
  expect(duplicationRoomNumbers(roomDuplicationInputSchema.parse({ from: 0, to: 2 }))).toEqual([
    '0',
    '1',
    '2',
  ]);
});
it.each([
  { roomNumbers: [] },
  { roomNumbers: ['1', ' 1'] },
  { roomNumbers: [' '] },
  { from: 3, to: 2 },
  { from: 0, to: 100 },
  { from: -1, to: 1 },
  { from: 1.5, to: 2 },
  { from: 1, to: 2, roomNumbers: ['3'] },
  { roomNumbers: ['1'], status: 'active' },
])('PROP-001: reject malformed duplication command %j', (input) => {
  expect(roomDuplicationInputSchema.safeParse(input).success).toBe(false);
});
it('ACC-004: reject repeated output identities', () => {
  const id = randomUUID();
  expect(
    roomDuplicationResultSchema.safeParse({ branchId: id, sourceRoomId: id, roomIds: [id, id] })
      .success,
  ).toBe(false);
});

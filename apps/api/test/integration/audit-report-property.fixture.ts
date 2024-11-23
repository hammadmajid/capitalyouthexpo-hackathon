import { expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  propertyBuildingSchema,
  propertyFloorSchema,
  propertyRoomLocationSchema,
} from '@hsm/contracts';
import { lifecycleHarness } from './phase-nine-fixture.js';
export function reportRoomCommand(
  h: ReturnType<typeof lifecycleHarness>,
  item: { base: string; roomId: string },
  body: Record<string, unknown>,
  token = h.fixture().ownerToken,
  key = randomUUID(),
) {
  return h.fixture().application.inject({
    method: 'PUT',
    url: item.base + '/rooms/' + item.roomId + '/location',
    headers: { authorization: 'Bearer ' + token, 'Idempotency-Key': key },
    payload: body,
  });
}
export async function reportPropertyFixture(h: ReturnType<typeof lifecycleHarness>) {
  const item = await h.fixture().inventory();
  const base = `/v1/branches/${item.branchId}/property`;
  const building = propertyBuildingSchema.parse(
    await h.ok(base + '/buildings', { name: 'Synthetic main building', sortOrder: 0 }),
  );
  const floor = propertyFloorSchema.parse(
    await h.ok(base + '/floors', { buildingId: building.id, label: 'Ground', levelNumber: 0 }),
  );
  const read = async () => {
    const response = await h.get(base + '/rooms/' + item.roomId + '/location');
    expect(response.statusCode, response.body).toBe(200);
    return propertyRoomLocationSchema.parse(response.json());
  };
  return { ...item, base, building, floor, read };
}

/// <reference types="jest" />
import {
  attachListingImage,
  createInventoryBed,
  createSetupRoom,
  createPropertyBuilding,
  createPropertyFloor,
  type ApiClient,
} from '@hsm/api-client';
import {
  propertyBuildingInputSchema,
  propertyFloorInputSchema,
  galleryAttachSchema,
  seatInputSchema,
} from '@hsm/contracts';
import { runFloorCommand } from './use-floor-rooms';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(), sessions: { restore: jest.fn() } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => '019a1234-1234-7123-8123-000000000099' }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  createPropertyBuilding: jest.fn(),
  createPropertyFloor: jest.fn(),
  createInventoryBed: jest.fn(),
  createSetupRoom: jest.fn(),
  attachListingImage: jest.fn(),
}));
const client = {} as ApiClient;
const branch = '019a1234-1234-7123-8123-000000000001',
  building = '019a1234-1234-7123-8123-000000000002',
  room = '019a1234-1234-7123-8123-000000000003',
  bed = '019a1234-1234-7123-8123-000000000004',
  file = '019a1234-1234-7123-8123-000000000005';
beforeEach(() => jest.clearAllMocks());
it('HSM-SETUP: every command sends only its strict contract fields (no internal kind)', async () => {
  await runFloorCommand(client, branch, { kind: 'building', name: 'Block A', sortOrder: 1 }, 'k1');
  await runFloorCommand(
    client,
    branch,
    { kind: 'floor', buildingId: building, label: 'Ground floor', levelNumber: 0 },
    'k2',
  );
  await runFloorCommand(
    client,
    branch,
    { kind: 'bed', roomId: room, input: { label: 'A', status: 'inactive' } },
    'k3',
  );
  await runFloorCommand(
    client,
    branch,
    { kind: 'photo', fileId: file, altText: 'Bed A', roomId: room, bedId: bed },
    'k4',
  );
  const buildingBody = jest.mocked(createPropertyBuilding).mock.calls[0]?.[2];
  const floorBody = jest.mocked(createPropertyFloor).mock.calls[0]?.[2];
  const bedBody = jest.mocked(createInventoryBed).mock.calls[0]?.[3];
  const photoBody = jest.mocked(attachListingImage).mock.calls[0]?.[2];
  expect(() => propertyBuildingInputSchema.parse(buildingBody)).not.toThrow();
  expect(() => propertyFloorInputSchema.parse(floorBody)).not.toThrow();
  expect(() => seatInputSchema.parse(bedBody)).not.toThrow();
  expect(galleryAttachSchema.parse(photoBody)).toMatchObject({
    target: { kind: 'bed', roomId: room, bedId: bed },
  });
  expect(floorBody).toEqual({ buildingId: building, label: 'Ground floor', levelNumber: 0 });
});

it('CHG-057 / ROOM-002: setup creates room identity without a bed count, security or shared rent', async () => {
  const input = { label: '101', floorId: building };
  await runFloorCommand(client, branch, { kind: 'setup_room', input }, 'same-key');
  expect(createSetupRoom).toHaveBeenCalledWith(client, branch, input, 'same-key');
  expect(createInventoryBed).not.toHaveBeenCalled();
});

import { expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { OccupancyController } from './occupancy.controller.js';
import { StayRecordController } from './record.controller.js';
import { ResidentController } from './residents.controller.js';
import { RentBoardController } from './rent-board.controller.js';
import type { OccupancyService } from './occupancy.service.js';
import type { StayRecordService } from './record.service.js';
import type { ResidentService } from './residents.service.js';
import type { RentBoardService } from './rent-board.service.js';
vi.mock('../access.js', async (original) => ({
  ...(await original<typeof import('../access.js')>()),
  actorOf: () => ({ userId: 'actor' }),
}));
const request = {} as FastifyRequest,
  actor = { userId: 'actor' };
it('BED-001 / BED-002: occupancy controller delegates exact scope to the service', async () => {
  const service = {
    page: vi.fn().mockResolvedValue('page'),
    bed: vi.fn().mockResolvedValue('bed'),
  };
  const controller = new OccupancyController(service as unknown as OccupancyService);
  await expect(controller.page(request, 'b', { on: 'd' })).resolves.toBe('page');
  await expect(controller.bed(request, 'b', 'x', {})).resolves.toBe('bed');
  expect(service.page).toHaveBeenCalledWith(actor, 'b', { on: 'd' });
  expect(service.bed).toHaveBeenCalledWith(actor, 'b', 'x', {});
});
it('STAY-002 / CHG-012: record controller keeps staff and own routes distinct', async () => {
  const service = { staff: vi.fn().mockResolvedValue('s'), own: vi.fn().mockResolvedValue('o') };
  const controller = new StayRecordController(service as unknown as StayRecordService);
  await expect(controller.staff(request, 'b', 's1', {})).resolves.toBe('s');
  await expect(controller.own(request, 's1', {})).resolves.toBe('o');
  expect(service.staff).toHaveBeenCalledWith(actor, 'b', 's1', {});
  expect(service.own).toHaveBeenCalledWith(actor, 's1', {});
});
it('RES-004: resident controller delegates directory and profile', async () => {
  const service = {
    directory: vi.fn().mockResolvedValue('d'),
    profile: vi.fn().mockResolvedValue('p'),
  };
  const controller = new ResidentController(service as unknown as ResidentService);
  await expect(controller.directory(request, 'b', { q: 'x' })).resolves.toBe('d');
  await expect(controller.profile(request, 'b', 'r', {})).resolves.toBe('p');
  expect(service.profile).toHaveBeenCalledWith(actor, 'b', 'r', {});
});
it('RB-004: Rent Board controller delegates the month query', async () => {
  const service = { page: vi.fn().mockResolvedValue('rb') };
  const controller = new RentBoardController(service as unknown as RentBoardService);
  await expect(controller.page(request, 'b', { month: '2026-10' })).resolves.toBe('rb');
  expect(service.page).toHaveBeenCalledWith(actor, 'b', { month: '2026-10' });
});

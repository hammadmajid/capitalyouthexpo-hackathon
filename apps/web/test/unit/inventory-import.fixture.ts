import type { readInventoryImport } from '@hsm/api-client';
export const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002',
  runId = '10000000-0000-4000-8000-000000000003',
  fileId = '10000000-0000-4000-8000-000000000004',
  typeId = '10000000-0000-4000-8000-000000000005';
export const roomTypes = [{ id: typeId, name: 'Twin beds', archivedAt: null }];
export const preview: Awaited<ReturnType<typeof readInventoryImport>> = {
  id: runId,
  branchId,
  kind: 'rooms',
  status: 'validated',
  totalRows: 2,
  errorRows: 0,
  createdAt: '2026-10-25T10:00:00.000Z',
  committedAt: null,
  rows: [201, 202].map((number, index) => ({
    recordNumber: index + 2,
    roomTypeId: typeId,
    roomNumber: String(number),
    bedLabel: null,
    errors: [],
  })),
  nextOffset: null,
};

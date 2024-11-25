import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  ApiFailure,
  readPropertyBuildings,
  createPropertyBuilding,
  createPropertyFloor,
  archivePropertyBuilding,
  archivePropertyFloor,
} from '@hsm/api-client';
import {
  branch,
  building,
  buildingId,
  floor,
  propertyFixture,
} from '../../test/unit/property.fixture';
import { PropertyManagement } from './property-management';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readPropertyBuildings: vi.fn(),
  readPropertyFloors: vi.fn(),
  readPropertyRoomLocation: vi.fn(),
  createPropertyBuilding: vi.fn(),
  createPropertyFloor: vi.fn(),
  archivePropertyBuilding: vi.fn(),
  archivePropertyFloor: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());
function mount() {
  const f = propertyFixture();
  const element = (
    <QueryClientProvider client={f.cache}>
      <PropertyManagement actorId={f.actorId} branchId={branch} />
    </QueryClientProvider>
  );
  return { ...render(element), ...f, element };
}
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Manage buildings and floors' }));
  await screen.findByRole('option', { name: 'Actual block' });
}
it('PROP / RPT-001 / AUD-010: named parent selection creates and archives metadata with exact branch and versions', async () => {
  const f = mount();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Add building' }));
  fireEvent.change(screen.getByLabelText('Building name'), {
    target: { value: 'New actual block' },
  });
  vi.mocked(createPropertyBuilding).mockResolvedValue({ ...building, name: 'New actual block' });
  fireEvent.click(screen.getByRole('button', { name: 'Save property metadata' }));
  await waitFor(() =>
    expect(createPropertyBuilding).toHaveBeenCalledWith(
      {},
      branch,
      { name: 'New actual block', sortOrder: 0 },
      expect.any(String),
    ),
  );
  await screen.findByText('Property metadata saved.');
  fireEvent.change(screen.getByLabelText('Property building'), { target: { value: buildingId } });
  await screen.findByRole('option', { name: 'Ground · Level 0' });
  fireEvent.click(screen.getByRole('button', { name: 'Add floor' }));
  fireEvent.change(screen.getByLabelText('Floor label'), { target: { value: 'First' } });
  fireEvent.change(screen.getByLabelText('Floor level'), { target: { value: '1' } });
  vi.mocked(createPropertyFloor).mockResolvedValue({ ...floor, label: 'First', levelNumber: 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Save property metadata' }));
  await waitFor(() =>
    expect(createPropertyFloor).toHaveBeenCalledWith(
      {},
      branch,
      { buildingId, label: 'First', levelNumber: 1 },
      expect.any(String),
    ),
  );
  await waitFor(() => expect(screen.queryByLabelText('Floor label')).toBeNull());
  fireEvent.change(screen.getByLabelText('Property floor'), { target: { value: floor.id } });
  fireEvent.click(screen.getByRole('button', { name: 'Archive selected floor' }));
  fireEvent.change(screen.getByLabelText('Property archive reason'), {
    target: { value: 'Retired floor classification' },
  });
  vi.mocked(archivePropertyFloor).mockResolvedValue({
    ...floor,
    version: 2,
    archivedAt: new Date().toISOString(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm property archive' }));
  await waitFor(() =>
    expect(archivePropertyFloor).toHaveBeenCalledWith(
      {},
      branch,
      floor.id,
      { expectedVersion: 1, reason: 'Retired floor classification' },
      expect.any(String),
    ),
  );
  await waitFor(() => expect(screen.queryByLabelText('Property archive reason')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Archive selected building' }));
  fireEvent.change(screen.getByLabelText('Property archive reason'), {
    target: { value: 'Retired block classification' },
  });
  vi.mocked(archivePropertyBuilding).mockResolvedValue({
    ...building,
    version: 2,
    archivedAt: new Date().toISOString(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm property archive' }));
  await waitFor(() =>
    expect(archivePropertyBuilding).toHaveBeenCalledWith(
      {},
      branch,
      buildingId,
      { expectedVersion: 1, reason: 'Retired block classification' },
      expect.any(String),
    ),
  );
  f.cache.clear();
});
it('ACC-004 / AUD-003/010: uncertain create retains the exact key/body across remount and blocks replacement or close', async () => {
  const f = mount();
  await open();
  vi.mocked(createPropertyBuilding)
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockResolvedValue({ ...building, name: 'Once only' });
  fireEvent.click(screen.getByRole('button', { name: 'Add building' }));
  fireEvent.change(screen.getByLabelText('Building name'), { target: { value: 'Once only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save property metadata' }));
  await screen.findByRole('button', { name: 'Retry previous request' });
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Close property metadata' }).disabled,
  ).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>('Building name').disabled).toBe(true);
  const original = vi.mocked(createPropertyBuilding).mock.calls[0];
  f.unmount();
  render(f.element);
  await open();
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Retry previous request' }).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry previous request' }));
  await screen.findByText('Property metadata saved.');
  expect(vi.mocked(createPropertyBuilding).mock.calls[1]).toEqual(original);
  expect(createPropertyBuilding).toHaveBeenCalledTimes(2);
});
it('SEC-003 / AUD-010: view-only grants and revoked cached parent scope expose no metadata writes', async () => {
  const f = mount();
  vi.mocked(readPropertyBuildings).mockResolvedValue({
    branchId: branch,
    canEdit: false,
    data: [building],
    nextCursor: null,
  });
  await open();
  expect(screen.queryByRole('button', { name: 'Add building' })).toBeNull();
  vi.mocked(readPropertyBuildings).mockRejectedValue(
    new ApiFailure({
      type: 'urn:hsm:error:forbidden',
      title: 'Forbidden',
      status: 403,
      code: 'FORBIDDEN',
      detail: 'Denied',
      traceId: 'synthetic',
    }),
  );
  await act(async () => {
    await f.cache.invalidateQueries({ queryKey: ['property-pages', f.actorId, branch] });
  });
  await screen.findByRole('alert');
  expect(screen.queryByRole('option', { name: 'Actual block' })).toBeNull();
  expect(screen.queryByLabelText('Building name')).toBeNull();
  expect(createPropertyBuilding).not.toHaveBeenCalled();
});
it('ACC-004 / AUD-010: stale archive keeps the entered reason; refresh outage cannot discard a new building draft', async () => {
  const f = mount();
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Add building' }));
  fireEvent.change(screen.getByLabelText('Building name'), { target: { value: 'Retained draft' } });
  vi.mocked(readPropertyBuildings).mockRejectedValue(new Error('Offline'));
  await act(async () => {
    await f.cache.invalidateQueries({ queryKey: ['property-pages', f.actorId, branch] });
  });
  await screen.findByRole('button', { name: 'Retry property access' });
  expect(screen.getByLabelText<HTMLInputElement>('Building name').value).toBe('Retained draft');
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Save property metadata' }).disabled,
  ).toBe(true);
  vi.mocked(readPropertyBuildings).mockResolvedValue({
    branchId: branch,
    canEdit: true,
    data: [building],
    nextCursor: null,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Retry property access' }));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel property edit' }).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel property edit' }));
  fireEvent.change(screen.getByLabelText('Property building'), { target: { value: buildingId } });
  await screen.findByRole('option', { name: 'Ground · Level 0' });
  fireEvent.click(screen.getByRole('button', { name: 'Archive selected building' }));
  fireEvent.change(screen.getByLabelText('Property archive reason'), {
    target: { value: 'Keep this reason' },
  });
  vi.mocked(archivePropertyBuilding).mockRejectedValue(
    new ApiFailure({
      type: 'urn:hsm:error:precondition_failed',
      title: 'Stale',
      status: 412,
      code: 'PRECONDITION_FAILED',
      detail: 'Stale',
      traceId: 'synthetic',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Confirm property archive' }));
  await waitFor(() => expect(archivePropertyBuilding).toHaveBeenCalled());
  await screen.findByRole('alert');
  expect(screen.getByLabelText<HTMLInputElement>('Property archive reason').value).toBe(
    'Keep this reason',
  );
  expect(screen.queryByText('Property metadata saved.')).toBeNull();
  vi.mocked(readPropertyBuildings).mockResolvedValue({
    branchId: branch,
    canEdit: true,
    data: [{ ...building, version: 2 }],
    nextCursor: null,
  });
  await act(async () => {
    await f.cache.invalidateQueries({ queryKey: ['property-pages', f.actorId, branch] });
  });
  await screen.findByRole('button', { name: 'Use current property version' });
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Confirm property archive' }).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Use current property version' }));
  expect(screen.getByLabelText<HTMLInputElement>('Property archive reason').value).toBe(
    'Keep this reason',
  );
  vi.mocked(archivePropertyBuilding).mockResolvedValue({
    ...building,
    version: 3,
    archivedAt: new Date().toISOString(),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Confirm property archive' }));
  await waitFor(() =>
    expect(archivePropertyBuilding).toHaveBeenLastCalledWith(
      {},
      branch,
      buildingId,
      { expectedVersion: 2, reason: 'Keep this reason' },
      expect.any(String),
    ),
  );
});

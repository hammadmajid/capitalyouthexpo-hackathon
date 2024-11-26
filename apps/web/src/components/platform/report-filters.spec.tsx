import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reportOptionQuerySchema } from '@hsm/contracts';
import { ReportDownloads } from './dashboards';
const lookup = vi.hoisted(() => vi.fn());
const branchReads = vi.hoisted(() => vi.fn());
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readReportFilterOptions: lookup,
  readApi: branchReads,
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({ GET: vi.fn() }) }));
const actor = '10000000-0000-4000-8000-000000000001';
const branch = '20000000-0000-4000-8000-000000000001';
const building = '30000000-0000-4000-8000-000000000001';
const floor = '40000000-0000-4000-8000-000000000001';
const room = '50000000-0000-4000-8000-000000000001';
const resident = '60000000-0000-4000-8000-000000000001';
function mount() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={cache}>
      <ReportDownloads actorId={actor} branchId={branch} />
    </QueryClientProvider>,
  );
  return { ...view, cache };
}
beforeEach(() => {
  branchReads.mockReset().mockResolvedValue({
    data: [
      {
        id: branch,
        organizationId: actor,
        brandId: actor,
        name: 'Actual first branch',
        verificationStatus: 'approved',
      },
      {
        id: room,
        organizationId: actor,
        brandId: actor,
        name: 'Actual second branch',
        verificationStatus: 'approved',
      },
    ],
    nextCursor: null,
  });
  lookup
    .mockReset()
    .mockImplementation(async (_client: unknown, scope: string, kind: string, input: unknown) => {
      expect(_client).toBeDefined();
      const q = reportOptionQuerySchema.parse(input);
      const values = {
        building: { id: building, name: 'Main block', detail: null, archived: false },
        floor: { id: floor, name: 'Ground floor', detail: null, archived: false },
        room: { id: room, name: 'Room 101', detail: null, archived: false },
        resident: { id: resident, name: 'Actual resident', detail: null, archived: false },
      };
      return {
        branchId: scope,
        type: kind,
        field: q.field,
        buildingId: q.buildingId ?? null,
        floorId: q.floorId ?? null,
        data: [values[q.field]],
        nextCursor: null,
      };
    });
});
it('OWN-004 / RPT-001 / AUD-010: owner named branch subsets reach exports and one selected branch enables dependent filters', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <ReportDownloads actorId={actor} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  await screen.findByRole('checkbox', { name: 'Report branch Actual first branch' });
  expect(screen.queryByLabelText('Report building')).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Report branch Actual first branch' }));
  await screen.findByRole('option', { name: 'Main block' });
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  let url = new URL(
    screen.getAllByRole('link')[0]?.getAttribute('href') ?? '',
    'https://example.test',
  );
  expect(url.pathname).toBe('/api/v1/owner/reports/occupancy');
  expect(url.searchParams.getAll('branchIds')).toEqual([branch]);
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: building } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Report branch Actual second branch' }));
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  expect(screen.queryByLabelText('Report building')).toBeNull();
  url = new URL(screen.getAllByRole('link')[0]?.getAttribute('href') ?? '', 'https://example.test');
  expect(url.searchParams.getAll('branchIds')).toEqual([branch, room]);
  expect(url.searchParams.has('buildingId')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Use all report branches' }));
  expect(
    new URL(
      screen.getAllByRole('link')[0]?.getAttribute('href') ?? '',
      'https://example.test',
    ).searchParams.has('branchIds'),
  ).toBe(false);
});
it('OWN-004 / SEC-003 / AUD-010: owner branch pages retain selected names and hide them if branch access refresh fails', async () => {
  const nextId = '70000000-0000-4000-8000-000000000001';
  const rows = Array.from({ length: 20 }, (_, index) => ({
    id: index === 0 ? branch : '20000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    organizationId: actor,
    brandId: actor,
    name: 'Owned branch ' + index,
    verificationStatus: 'approved',
  }));
  branchReads
    .mockReset()
    .mockResolvedValueOnce({ data: rows, nextCursor: rows.at(-1)?.id })
    .mockResolvedValue({
      data: [{ ...rows[0], id: nextId, name: 'Next owned branch' }],
      nextCursor: null,
    });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cache}>
      <ReportDownloads actorId={actor} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  await screen.findByRole('checkbox', { name: 'Report branch Owned branch 0' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Report branch Owned branch 0' }));
  fireEvent.click(screen.getByRole('button', { name: 'More report branches' }));
  await screen.findByRole('checkbox', { name: 'Report branch Next owned branch' });
  expect(screen.getByText('Selected: Owned branch 0')).toBeDefined();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Report branch Next owned branch' }));
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  expect(
    new URL(
      screen.getAllByRole('link')[0]?.getAttribute('href') ?? '',
      'https://example.test',
    ).searchParams.getAll('branchIds'),
  ).toEqual([branch, nextId]);
  branchReads.mockRejectedValue(new Error('Synthetic Owner access revoked'));
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['report-owner-branches', actor] });
  });
  await screen.findByRole('button', { name: 'Retry report branch access' });
  expect(screen.queryByText(/Selected: Owned branch/)).toBeNull();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});
afterEach(() => cleanup());
it('RPT-001 / AUD-010: actual named choices reach both export formats with every applicable selection', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  fireEvent.change(screen.getByLabelText('Report type'), { target: { value: 'residents' } });
  await screen.findByRole('option', { name: 'Main block' });
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: building } });
  await screen.findByRole('option', { name: 'Ground floor' });
  fireEvent.change(screen.getByLabelText('Report floor'), { target: { value: floor } });
  await screen.findByRole('option', { name: 'Room 101' });
  fireEvent.change(screen.getByLabelText('Report room'), { target: { value: room } });
  fireEvent.change(screen.getByLabelText('Report resident'), { target: { value: resident } });
  fireEvent.change(screen.getByLabelText('Report status'), { target: { value: 'active' } });
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  for (const link of screen.getAllByRole('link')) {
    const url = new URL(link.getAttribute('href') ?? '', 'https://example.test');
    expect(url.pathname).toBe('/api/v1/branches/' + branch + '/reports/residents');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      buildingId: building,
      floorId: floor,
      roomId: room,
      residentId: resident,
      status: 'active',
    });
  }
  expect(document.body.textContent).not.toContain(resident);
});
it('RPT-001 / AUD-010: each family offers only applicable resident/status filters and changing family clears selections', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  expect(screen.queryByLabelText('Report resident')).toBeNull();
  await screen.findByRole('option', { name: 'Main block' });
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: building } });
  fireEvent.change(screen.getByLabelText('Report type'), { target: { value: 'payment-history' } });
  expect(screen.queryByLabelText('Report status')).toBeNull();
  await screen.findByRole('option', { name: 'Actual resident' });
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  expect(screen.getByLabelText<HTMLSelectElement>('Report building').value).toBe('');
  expect(screen.getAllByRole('link')[0]?.getAttribute('href')).not.toContain('buildingId=');
});
it('SEC-003 / AUD-010: failed named authority offers neither cached choices nor export links', async () => {
  lookup.mockRejectedValue(new Error('Synthetic access loss'));
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  await screen.findAllByRole('alert');
  expect(screen.queryByRole('option', { name: 'Main block' })).toBeNull();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});
it('RPT-001 / AUD-010: changing a building clears its dependent floor and room without clearing the resident', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  fireEvent.change(screen.getByLabelText('Report type'), { target: { value: 'residents' } });
  await screen.findByRole('option', { name: 'Main block' });
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: building } });
  await screen.findByRole('option', { name: 'Ground floor' });
  fireEvent.change(screen.getByLabelText('Report floor'), { target: { value: floor } });
  await screen.findByRole('option', { name: 'Room 101' });
  await screen.findByRole('option', { name: 'Actual resident' });
  fireEvent.change(screen.getByLabelText('Report room'), { target: { value: room } });
  fireEvent.change(screen.getByLabelText('Report resident'), { target: { value: resident } });
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: '' } });
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  expect(screen.queryByLabelText('Report floor')).toBeNull();
  expect(screen.getByLabelText<HTMLSelectElement>('Report room').value).toBe('');
  const params = new URL(
    screen.getAllByRole('link')[0]?.getAttribute('href') ?? '',
    'https://example.test',
  ).searchParams;
  expect(params.has('buildingId')).toBe(false);
  expect(params.has('floorId')).toBe(false);
  expect(params.has('roomId')).toBe(false);
  expect(params.get('residentId')).toBe(resident);
});
it('SEC-003 / AUD-010: a failed authority refresh hides cached names and blocks exports', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  fireEvent.change(screen.getByLabelText('Report type'), { target: { value: 'residents' } });
  await screen.findByRole('option', { name: 'Actual resident' });
  fireEvent.change(screen.getByLabelText('Report resident'), { target: { value: resident } });
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  lookup.mockRejectedValue(new Error('Synthetic revoked authority'));
  await act(async () => {
    await view.cache.invalidateQueries({
      queryKey: ['report-options', actor, branch, 'residents'],
    });
  });
  await screen.findAllByRole('alert');
  expect(screen.queryByRole('option', { name: 'Actual resident' })).toBeNull();
  expect(screen.queryAllByRole('link')).toHaveLength(0);
});
it('SEC-003 / AUD-010: changing actor scope closes filters and discards the prior selections', async () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  await screen.findByRole('option', { name: 'Main block' });
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: building } });
  view.rerender(
    <QueryClientProvider client={view.cache}>
      <ReportDownloads actorId={resident} branchId={branch} />
    </QueryClientProvider>,
  );
  expect(screen.queryByLabelText('Report type')).toBeNull();
  expect(screen.queryByRole('option', { name: 'Main block' })).toBeNull();
  expect(
    screen
      .getAllByRole('link')
      .every((link) => !link.getAttribute('href')?.includes('buildingId=')),
  ).toBe(true);
});
it('RPT-001 / AUD-010: bounded choice paging and literal search reset cursors while preserving the selected filter', async () => {
  const base = lookup.getMockImplementation();
  if (!base) throw new Error('Lookup fixture missing');
  const choices = Array.from({ length: 20 }, (_, index) => ({
    id: '30000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    name: index === 0 ? 'Main block' : 'Building ' + index,
    detail: null,
    archived: false,
  }));
  const other = {
    id: '30000000-0000-4000-8000-000000000021',
    name: 'Other block',
    detail: null,
    archived: false,
  };
  lookup.mockImplementation(
    async (client: unknown, scope: string, kind: string, input: unknown) => {
      const q = reportOptionQuerySchema.parse(input);
      if (q.field !== 'building') return base(client, scope, kind, input);
      return {
        branchId: scope,
        type: kind,
        field: q.field,
        buildingId: null,
        floorId: null,
        data: q.cursor || q.search ? [other] : choices,
        nextCursor: q.cursor || q.search ? null : choices.at(-1)?.id,
      };
    },
  );
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Filter reports' }));
  const picker = within(screen.getByRole('group', { name: 'Report building' }));
  await picker.findByRole('option', { name: 'Main block' });
  fireEvent.change(screen.getByLabelText('Report building'), { target: { value: building } });
  fireEvent.click(picker.getByRole('button', { name: 'More building choices' }));
  await picker.findByRole('option', { name: 'Other block' });
  expect(screen.getByLabelText<HTMLSelectElement>('Report building').value).toBe(building);
  fireEvent.click(picker.getByRole('button', { name: 'First building choices' }));
  await waitFor(() => expect(picker.queryByRole('option', { name: 'Other block' })).toBeNull());
  await waitFor(() =>
    expect(
      picker.getByRole<HTMLButtonElement>('button', { name: 'More building choices' }).disabled,
    ).toBe(false),
  );
  fireEvent.click(picker.getByRole('button', { name: 'More building choices' }));
  await picker.findByRole('option', { name: 'Other block' });
  fireEvent.change(screen.getByLabelText('Search report building'), { target: { value: 'Other' } });
  fireEvent.click(picker.getByRole('button', { name: 'Search building choices' }));
  await waitFor(() =>
    expect(
      lookup.mock.calls.some((call) => {
        const q = reportOptionQuerySchema.parse(call[3]);
        return q.field === 'building' && q.search === 'Other' && q.cursor === undefined;
      }),
    ).toBe(true),
  );
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(2));
  expect(
    new URL(
      screen.getAllByRole('link')[0]?.getAttribute('href') ?? '',
      'https://example.test',
    ).searchParams.get('buildingId'),
  ).toBe(building);
});

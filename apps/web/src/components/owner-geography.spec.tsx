import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { listOwnerCities, listOwnerAreas, type ApiClient } from '@hsm/api-client';
import { OwnerGeography } from './owner-geography';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  listOwnerCities: vi.fn(),
  listOwnerAreas: vi.fn(),
}));
const city = '550e8400-e29b-41d4-a716-446655440000',
  area = '550e8400-e29b-41d4-a716-446655440001',
  sub = '550e8400-e29b-41d4-a716-446655440002';
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listOwnerCities).mockResolvedValue({
    data: [{ id: city, name: 'Islamabad' }],
    nextCursor: null,
  });
  vi.mocked(listOwnerAreas).mockImplementation(async (_client, _city, query) => ({
    data: [
      {
        id: query?.parentId ? sub : area,
        cityId: city,
        parentId: query?.parentId ?? null,
        name: query?.parentId ? 'Sub area' : 'Main area',
        level: query?.parentId ? 'sub_area' : 'area',
      },
    ],
    nextCursor: null,
  }));
});
afterEach(cleanup);
it('ONB-001: changing a city clears its dependent selections and displays names without UUID input', async () => {
  const change = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerGeography
        userId="owner"
        client={{} as ApiClient}
        value={{ cityId: null, areaId: null, subAreaId: null }}
        change={change}
      />
    </QueryClientProvider>,
  );
  await userEvent.setup().click(await screen.findByRole('button', { name: 'Islamabad' }));
  expect(change).toHaveBeenCalledWith({ cityId: city, areaId: null, subAreaId: null });
  expect(listOwnerAreas).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(city);
  expect(screen.queryByRole('textbox')).toBeNull();
});
it('ONB-001: area and optional sub-area queries retain the chosen city and parent scope', async () => {
  const change = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <OwnerGeography
        userId="owner"
        client={{} as ApiClient}
        value={{ cityId: city, areaId: area, subAreaId: sub }}
        change={change}
      />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  expect(
    (await screen.findByRole('button', { name: 'Main area' })).getAttribute('aria-pressed'),
  ).toBe('true');
  await user.click(await screen.findByRole('button', { name: 'Main area' }));
  expect(change).toHaveBeenLastCalledWith({ cityId: city, areaId: area, subAreaId: null });
  await user.click(await screen.findByRole('button', { name: 'Sub area' }));
  expect(change).toHaveBeenLastCalledWith({ cityId: city, areaId: area, subAreaId: sub });
  expect(listOwnerAreas).toHaveBeenCalledWith({}, city, { limit: 20, parentId: area });
  await user.click(screen.getByRole('button', { name: 'Clear optional sub-area' }));
  expect(change).toHaveBeenLastCalledWith({ cityId: city, areaId: area, subAreaId: null });
});

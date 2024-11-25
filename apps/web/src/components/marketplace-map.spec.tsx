import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { listingSummarySchema } from '@hsm/contracts';
import { MarketplaceMap } from './marketplace-map';
const state = vi.hoisted(() => ({
  events: new Map<string, () => void>(),
  create: vi.fn(),
  remove: vi.fn(),
  markerRemove: vi.fn(),
  points: vi.fn(),
  fail: false,
  bounds: { west: 73, east: 73.2, south: 33.5, north: 33.8 },
}));
const workerUrl = vi.hoisted(() => vi.fn());
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: workerUrl,
  Map: class {
    constructor(options: unknown) {
      if (state.fail) throw new Error('WebGL unavailable');
      state.create(options);
    }
    on(name: string, callback: () => void) {
      state.events.set(name, callback);
    }
    addControl() {}
    getBounds() {
      return {
        getWest: () => state.bounds.west,
        getEast: () => state.bounds.east,
        getSouth: () => state.bounds.south,
        getNorth: () => state.bounds.north,
      };
    }
    remove() {
      state.remove();
    }
  },
  Marker: class {
    element: HTMLElement;
    constructor(options: { element: HTMLElement }) {
      this.element = options.element;
    }
    setLngLat(point: unknown) {
      state.points(point);
      return this;
    }
    addTo() {
      document.body.append(this.element);
      return this;
    }
    remove() {
      this.element.remove();
      state.markerRemove();
    }
  },
  NavigationControl: class {
    container = document.createElement('div');
  },
}));
const listing = listingSummarySchema.parse({
  branchId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  brandName: 'Actual brand',
  name: 'Actual hostel',
  slug: 'actual',
  category: 'boys',
  city: 'Islamabad',
  area: null,
  latitude: 33.6,
  longitude: 73.1,
  priceFromPaisa: 1800001,
  verified: true,
  availableBeds: null,
  availableWholeRooms: null,
  amenities: [],
  media: [],
  distanceMeters: null,
});
beforeEach(() => {
  state.fail = false;
  state.bounds = { west: 73, east: 73.2, south: 33.5, north: 33.8 };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.events.clear();
});
async function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Show hostel map' }));
  await waitFor(() => expect(state.events.has('load')).toBe(true));
  act(() => state.events.get('load')?.());
}
it('ACC-002: map is opt-in and markers use only actual approved coordinates and exact prices', async () => {
  const search = vi.fn();
  render(<MarketplaceMap listings={[listing]} onSearch={search} disabled={false} />);
  expect(state.create).not.toHaveBeenCalled();
  await open();
  expect(state.points).toHaveBeenCalledWith([73.1, 33.6]);
  const link = screen.getByRole('link', { name: 'View Actual hostel' });
  expect(link.getAttribute('href')).toBe('/hostels/' + listing.branchId);
  expect(link.textContent).toContain('18,000.01');
  fireEvent.click(screen.getByRole('button', { name: 'Search this map area' }));
  expect(search).toHaveBeenCalledWith(state.bounds);
});
it('ACC-002: updated results replace markers without recreating the viewport', async () => {
  const search = vi.fn(),
    value = render(<MarketplaceMap listings={[listing]} onSearch={search} disabled={false} />);
  await open();
  value.rerender(
    <MarketplaceMap
      listings={[{ ...listing, name: 'Updated hostel', priceFromPaisa: null }]}
      onSearch={search}
      disabled={false}
    />,
  );
  expect(screen.queryByRole('link', { name: 'View Actual hostel' })).toBeNull();
  expect(screen.getByRole('link', { name: 'View Updated hostel' }).textContent).toBe(
    'Updated hostel',
  );
  expect(state.create).toHaveBeenCalledOnce();
  expect(state.markerRemove).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Close hostel map' }));
  expect(state.remove).toHaveBeenCalledOnce();
  expect(screen.queryByRole('link', { name: 'View Updated hostel' })).toBeNull();
});
it('ACC-002: incomplete or invalid viewport bounds cannot start a search', async () => {
  const search = vi.fn();
  render(<MarketplaceMap listings={[]} onSearch={search} disabled={false} />);
  await open();
  state.bounds = { west: 200, east: 220, south: 33, north: 34 };
  act(() => state.events.get('moveend')?.());
  const button = screen.getByRole('button', { name: 'Search this map area' }) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  fireEvent.click(button);
  expect(search).not.toHaveBeenCalled();
});
it('ACC-002: tile errors leave discovery available and prevent failed viewport searches', async () => {
  render(<MarketplaceMap listings={[]} onSearch={vi.fn()} disabled={false} />);
  await open();
  act(() => state.events.get('error')?.());
  expect(screen.getByRole('alert').textContent).toContain(
    'Hostel cards and search remain available',
  );
  expect(
    (screen.getByRole('button', { name: 'Search this map area' }) as HTMLButtonElement).disabled,
  ).toBe(true);
});
it('ACC-002: WebGL startup failure is recoverable by closing the opt-in map', async () => {
  state.fail = true;
  render(<MarketplaceMap listings={[]} onSearch={vi.fn()} disabled={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show hostel map' }));
  expect(await screen.findByRole('alert')).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Close hostel map' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
it('ACC-002: pending discovery disables search and an empty result set invents no markers', async () => {
  const search = vi.fn();
  render(<MarketplaceMap listings={[]} onSearch={search} disabled />);
  await open();
  expect(state.points).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Search this map area' }));
  expect(search).not.toHaveBeenCalled();
});

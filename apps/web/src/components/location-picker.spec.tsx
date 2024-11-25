import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LocationPicker } from './location-picker';
const map = vi.hoisted(() => ({
  events: new Map<string, (event: unknown) => void>(),
  remove: vi.fn(),
  create: vi.fn(),
  marker: vi.fn(),
}));
const workerUrl = vi.hoisted(() => vi.fn());
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: workerUrl,
  Map: class {
    constructor(options: unknown) {
      map.create(options);
    }
    on(name: string, callback: (event: unknown) => void) {
      map.events.set(name, callback);
    }
    addControl() {}
    remove() {
      map.remove();
    }
  },
  Marker: class {
    setLngLat(value: unknown) {
      map.marker(value);
      return this;
    }
    addTo() {
      return this;
    }
  },
  NavigationControl: class {
    container = document.createElement('div');
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  map.events.clear();
});
it('ONB-001: map loads only on request and requires explicit valid selection before form changes', async () => {
  const change = vi.fn();
  render(<LocationPicker values={{}} change={change} disabled={false} />);
  expect(map.create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Choose on map'));
  await waitFor(() => expect(map.events.has('click')).toBe(true));
  // ONB-001: the worker is served from our own origin so CSP worker-src 'self' applies.
  expect(workerUrl).toHaveBeenCalledWith('/vendor/maplibre-gl-worker.mjs');
  expect(screen.getByText('Loading map…').textContent).toBe('Loading map…');
  act(() => map.events.get('load')?.({}));
  expect(screen.getByText('Map ready.').textContent).toBe('Map ready.');
  expect(screen.getByText('Use selected pin').closest('button')?.disabled).toBe(true);
  act(() => map.events.get('click')?.({ lngLat: { lng: 999, lat: 33 } }));
  expect(change).not.toHaveBeenCalled();
  act(() => map.events.get('click')?.({ lngLat: { lng: 73.04, lat: 33.7 } }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Use selected pin'));
  expect(change).toHaveBeenCalledWith({ longitude: 73.04, latitude: 33.7 });
  expect(map.remove).toHaveBeenCalledOnce();
});
it('ONB-001: cancel and tile failure preserve manual coordinates and other draft fields', async () => {
  const change = vi.fn();
  render(
    <LocationPicker
      values={{ longitude: '73', latitude: '33', address: 'Retained address' }}
      change={change}
      disabled={false}
    />,
  );
  fireEvent.click(screen.getByText('Choose on map'));
  await waitFor(() => expect(map.events.has('error')).toBe(true));
  expect(map.marker).toHaveBeenCalledWith([73, 33]);
  act(() => map.events.get('error')?.({}));
  expect(screen.getByRole('alert').textContent).toContain('enter coordinates manually');
  fireEvent.click(screen.getByText('Cancel map'));
  expect(change).not.toHaveBeenCalled();
  expect(map.remove).toHaveBeenCalledOnce();
});
it('ONB-001: submitting forms cannot open a picker', () => {
  render(<LocationPicker values={{}} change={vi.fn()} disabled />);
  expect(screen.getByText('Choose on map').closest('button')?.disabled).toBe(true);
});

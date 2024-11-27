/// <reference types="jest" />
import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { marketplaceInstitutions } from '@hsm/api-client';
import type { MarketplaceQuery } from '@hsm/contracts';
import { PlaceSuggestions, usePlaceSearch } from './place-suggestions';
jest.mock('../../lib/runtime', () => ({ client: {} }));
jest.mock('@hsm/api-client', () => ({ marketplaceInstitutions: jest.fn() }));
const g10 = {
  id: '01a1db1b-5cfe-7469-8912-3a8d2624a6ae',
  type: 'locality' as const,
  name: 'G-10',
  shortName: null,
  cityId: '01a18a5b-0474-7749-8870-25283b419ecc',
  latitude: 33.67,
  longitude: 73.01,
  hostelCount: 2,
};
function Harness() {
  const [query, setQuery] = useState<Partial<MarketplaceQuery>>({ limit: 20 });
  const places = usePlaceSearch(setQuery);
  return (
    <>
      <TextInput
        accessibilityLabel="Search"
        value={places.search}
        onChangeText={places.onChange}
        onSubmitEditing={places.onSubmit}
      />
      <PlaceSuggestions places={places.places} pick={places.pick} />
      <Text>{JSON.stringify(query)}</Text>
    </>
  );
}
async function mount() {
  await render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <Harness />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.mocked(marketplaceInstitutions).mockResolvedValue({ data: [g10], nextCursor: null });
});
afterEach(() => jest.useRealTimers());
test('CHG-033: typing an area offers it, and picking it lists hostels nearest first', async () => {
  await mount();
  await fireEvent.changeText(screen.getByLabelText('Search'), 'g-10');
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  await fireEvent.press(await screen.findByRole('button', { name: 'Hostels near G-10, Area' }));
  expect(marketplaceInstitutions).toHaveBeenCalledWith({}, expect.objectContaining({ q: 'g-10' }));
  expect(
    screen.getByText(
      JSON.stringify({
        universityPlaceId: g10.id,
        radiusMeters: 10000,
        sort: 'nearest',
        limit: 20,
      }),
    ),
  ).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Hostels near G-10, Area' })).toBeNull();
});
test('CHG-033: with no matching place, submitting falls back to a text search', async () => {
  jest.mocked(marketplaceInstitutions).mockResolvedValue({ data: [], nextCursor: null });
  await mount();
  await fireEvent.changeText(screen.getByLabelText('Search'), 'x');
  await fireEvent(screen.getByLabelText('Search'), 'submitEditing');
  expect(screen.getByText(JSON.stringify({ limit: 20, q: 'x' }))).toBeTruthy();
});

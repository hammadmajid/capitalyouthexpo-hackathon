import { act } from '@testing-library/react-native';
import type { QueryClient } from '@tanstack/react-query';
// What a pull-down on the screen does: reload every query it shows.
export async function pullToRefresh(cache: QueryClient) {
  await act(async () => {
    await cache.refetchQueries({ type: 'active' });
  });
}
// Starts a pull without waiting for it to finish (for reads a test keeps pending).
export async function startPullToRefresh(cache: QueryClient) {
  await act(async () => {
    void cache.refetchQueries({ type: 'active' });
  });
}

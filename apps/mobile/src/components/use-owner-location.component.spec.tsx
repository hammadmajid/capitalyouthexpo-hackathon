/// <reference types="jest" />
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useOwnerLocation } from './use-owner-location';
import { detectOwnerLocation, type OwnerLocationResult } from '../lib/owner-location';
jest.mock('../lib/owner-location', () => ({ detectOwnerLocation: jest.fn() }));
beforeEach(() => jest.resetAllMocks());
test('GEO SEC-003: no lookup starts outside a verified Owner setup', async () => {
  await renderHook(() => useOwnerLocation(undefined));
  expect(detectOwnerLocation).not.toHaveBeenCalled();
});
test('ONB-001: entering setup automatically detects once and permits a deliberate refresh', async () => {
  jest
    .mocked(detectOwnerLocation)
    .mockResolvedValue({ status: 'ready', pin: { latitude: 33.7, longitude: 73.04 } });
  const hook = await renderHook(() => useOwnerLocation('owner'));
  await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
  expect(detectOwnerLocation).toHaveBeenCalledTimes(1);
  await act(async () => {
    await hook.result.current.detect();
  });
  expect(detectOwnerLocation).toHaveBeenCalledTimes(2);
});
test('SEC-003: a late former identity lookup cannot initialize the next Owner draft', async () => {
  let finish: ((value: OwnerLocationResult) => void) | undefined;
  jest
    .mocked(detectOwnerLocation)
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ status: 'denied' });
  const hook = await renderHook(({ actor }: { actor: string }) => useOwnerLocation(actor), {
    initialProps: { actor: 'first' },
  });
  await hook.rerender({ actor: 'second' });
  await waitFor(() => expect(hook.result.current.state.status).toBe('denied'));
  await act(async () => {
    finish?.({ status: 'ready', pin: { latitude: 33.7, longitude: 73.04 } });
  });
  expect(hook.result.current.state).toEqual({ status: 'denied' });
});

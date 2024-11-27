import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { detectOwnerLocation } from './owner-location';
const { current, permissions, request, services } = vi.hoisted(() => ({
  current: vi.fn(),
  permissions: vi.fn(),
  request: vi.fn(),
  services: vi.fn(),
}));
vi.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: permissions,
  requestForegroundPermissionsAsync: request,
  hasServicesEnabledAsync: services,
  getCurrentPositionAsync: current,
}));
beforeEach(() => {
  vi.resetAllMocks();
  permissions.mockResolvedValue({ granted: true, canAskAgain: true });
  services.mockResolvedValue(true);
  current.mockResolvedValue({ coords: { latitude: 33.7, longitude: 73.04 } });
});
afterEach(() => vi.useRealTimers());
it('ONB-001 GEO: detects a current pin once using foreground balanced accuracy', async () => {
  expect(await detectOwnerLocation()).toEqual({
    status: 'ready',
    pin: { latitude: 33.7, longitude: 73.04 },
  });
  expect(request).not.toHaveBeenCalled();
  expect(current).toHaveBeenCalledWith({ accuracy: 3, mayShowUserSettingsDialog: false });
});
it('ONB-001 GEO: requests OS permission before the first location lookup', async () => {
  permissions.mockResolvedValue({ granted: false, canAskAgain: true });
  request.mockResolvedValue({ granted: true });
  expect((await detectOwnerLocation()).status).toBe('ready');
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.invocationCallOrder[0]).toBeLessThan(
    current.mock.invocationCallOrder[0] ?? 0,
  );
});
it.each([true, false])(
  'SEC-003: denied permission with canAskAgain=%s never reads coordinates',
  async (canAskAgain) => {
    permissions.mockResolvedValue({ granted: false, canAskAgain });
    request.mockResolvedValue({ granted: false });
    expect(await detectOwnerLocation()).toEqual({ status: 'denied' });
    expect(request).toHaveBeenCalledTimes(canAskAgain ? 1 : 0);
    expect(current).not.toHaveBeenCalled();
  },
);
it('ONB-001: disabled location services leave manual selection available', async () => {
  services.mockResolvedValue(false);
  expect(await detectOwnerLocation()).toEqual({ status: 'unavailable' });
  expect(current).not.toHaveBeenCalled();
});
it('SEC-003: provider failures expose no native details or location', async () => {
  current.mockRejectedValue(new Error('private provider details'));
  expect(await detectOwnerLocation()).toEqual({ status: 'unavailable' });
});
it('GEO: invalid coordinates cannot initialize a hostel pin', async () => {
  current.mockResolvedValue({ coords: { latitude: 100, longitude: 73 } });
  expect(await detectOwnerLocation()).toEqual({ status: 'unavailable' });
});
it('GEO: a slow fix returns control to manual selection and clears its timeout', async () => {
  vi.useFakeTimers();
  current.mockReturnValue(new Promise(() => undefined));
  const work = detectOwnerLocation(50);
  await vi.waitFor(() => expect(current).toHaveBeenCalledOnce());
  await vi.advanceTimersByTimeAsync(60);
  expect(await work).toEqual({ status: 'unavailable' });
  expect(vi.getTimerCount()).toBe(0);
});

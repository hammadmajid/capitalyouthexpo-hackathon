import { readMapPin, type MapPin } from '@hsm/api-client';
export type OwnerLocationResult =
  { status: 'ready'; pin: MapPin } | { status: 'denied' | 'unavailable' };

// Foreground, one-shot lookup only. Coordinates remain in the current setup draft
// until the Owner saves the branch through the normal API.
export async function detectOwnerLocation(milliseconds = 12000): Promise<OwnerLocationResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // A native update is required. An older installed binary falls back to the map.
    const location = await import('expo-location');
    let permission = await location.getForegroundPermissionsAsync();
    if (!permission.granted && permission.canAskAgain)
      permission = await location.requestForegroundPermissionsAsync();
    if (!permission.granted) return { status: 'denied' };
    if (!(await location.hasServicesEnabledAsync())) return { status: 'unavailable' };
    const position = await Promise.race([
      location.getCurrentPositionAsync({
        accuracy: location.Accuracy.Balanced,
        mayShowUserSettingsDialog: false,
      }),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), milliseconds);
      }),
    ]);
    const pin = position && readMapPin(position.coords.longitude, position.coords.latitude);
    return pin ? { status: 'ready', pin } : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

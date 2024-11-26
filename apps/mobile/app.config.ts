import 'tsx/cjs';
import { withAndroidManifest } from '@expo/config-plugins';
import type { ExpoConfig } from 'expo/config';
import { colors } from '@hsm/ui';
import { validateMobileConfig } from './src/lib/config';
import { withAndroidNativePaths } from './scripts/android-native-paths';
const config = validateMobileConfig({
  environment: process.env.EXPO_PUBLIC_APP_ENV ?? 'development',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  webUrl: process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000',
});
const expo: ExpoConfig = {
  name: 'HSM',
  slug: 'hsm',
  version: '0.1.0',
  scheme: 'hsm',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  backgroundColor: colors.background,
  android: {
    package: 'pk.hsm.app',
    permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
    blockedPermissions: ['ACCESS_BACKGROUND_LOCATION', 'FOREGROUND_SERVICE_LOCATION'],
    allowBackup: false,
  },
  ios: { bundleIdentifier: 'pk.hsm.app', supportsTablet: true },
  plugins: [
    'expo-router',
    '@maplibre/maplibre-react-native',
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Use your current location to choose the hostel location. You can change the pin on the map.',
        locationAlwaysPermission: false,
        locationAlwaysAndWhenInUsePermission: false,
        motionUsagePermission: false,
        isIosBackgroundLocationEnabled: false,
        isAndroidBackgroundLocationEnabled: false,
        isAndroidForegroundServiceEnabled: false,
      },
    ],
    ['expo-secure-store', { configureAndroidBackup: true }],
    [
      'expo-media-library',
      {
        photosPermission: false,
        savePhotosPermission: 'Save a payment receipt to your gallery when you choose Save image.',
        granularPermissions: [],
        isAccessMediaLocationEnabled: false,
      },
    ],
    ['expo-font', { fonts: [] }],
  ],
  experiments: { typedRoutes: true },
  extra: { environment: config.environment },
};
export default withAndroidManifest(withAndroidNativePaths(expo), (mod) => {
  // Non-clearing prebuild retains historical tools:node="remove" entries.
  // Foreground access is now approved; background/service blocks remain intact.
  const permissions = (mod.modResults.manifest['uses-permission'] ??= []);
  for (const name of [
    // eslint-disable-next-line no-secrets/no-secrets -- Public Android permission name, not a secret.
    'android.permission.ACCESS_COARSE_LOCATION',
    // eslint-disable-next-line no-secrets/no-secrets -- Public Android permission name, not a secret.
    'android.permission.ACCESS_FINE_LOCATION',
  ]) {
    const existing = permissions.find((permission) => permission.$['android:name'] === name);
    if (existing) delete existing.$['tools:node'];
    else permissions.push({ $: { 'android:name': name } });
  }
  const application = mod.modResults.manifest.application?.[0];
  if (!application) throw new Error('Android application manifest missing');
  application.$['android:usesCleartextTraffic'] = ['development', 'test'].includes(
    config.environment,
  )
    ? 'true'
    : 'false';
  return mod;
});

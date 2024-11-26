import { expect, it } from 'vitest';
import { androidNativePathsGradle } from './android-native-paths';

it('ACC-002: native staging configuration preserves project plugins and enables normal regeneration', () => {
  const original =
    'apply plugin: "expo-root-project"\napply plugin: "com.facebook.react.rootproject"\n';
  const configured = androidNativePathsGradle(original);
  expect(configured).toContain(original.trimEnd());
  expect(configured).toContain(
    'apply from: new File(rootDir, "../scripts/android-native-paths.gradle")',
  );
  expect(configured).not.toContain('CMAKE_SUPPRESS_REGENERATION');
  expect(configured.indexOf('apply from:')).toBeLessThan(
    configured.indexOf('apply plugin: "expo-root-project"'),
  );
});

it('ACC-002: repeated Expo prebuilds attach the native staging configuration exactly once', () => {
  const once = androidNativePathsGradle('buildscript {}\napply plugin: "expo-root-project"\n');
  expect(androidNativePathsGradle(once)).toBe(once);
});

it('ACC-002: unexpected native templates fail explicitly rather than silently skipping staging', () => {
  expect(() => androidNativePathsGradle('buildscript {}\n')).toThrow('Expo root Gradle plugin');
});

it('ACC-002: an existing late hook is moved before root project evaluation', () => {
  const configured = androidNativePathsGradle(
    'apply plugin: "expo-root-project"\napply from: new File(rootDir, "../scripts/android-native-paths.gradle")\n',
  );
  expect(configured.match(/apply from:/g)).toHaveLength(1);
  expect(configured.indexOf('apply from:')).toBeLessThan(configured.indexOf('apply plugin:'));
  expect(androidNativePathsGradle(configured)).toBe(configured);
});

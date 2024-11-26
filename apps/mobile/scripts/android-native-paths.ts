import { withProjectBuildGradle, type ConfigPlugin } from '@expo/config-plugins';

const applyNativePaths = 'apply from: new File(rootDir, "../scripts/android-native-paths.gradle")';

export function androidNativePathsGradle(contents: string): string {
  const rootPlugin = 'apply plugin: "expo-root-project"';
  if (
    contents.includes(applyNativePaths) &&
    contents.indexOf(applyNativePaths) < contents.indexOf(rootPlugin)
  ) {
    return contents;
  }
  const withoutHook = contents.replace(applyNativePaths, '').trimEnd();
  if (!withoutHook.includes(rootPlugin)) {
    throw new Error('Cannot configure native staging: Expo root Gradle plugin was not found.');
  }
  return `${withoutHook.replace(rootPlugin, `${applyNativePaths}\n\n${rootPlugin}`)}\n`;
}

export const withAndroidNativePaths: ConfigPlugin = (config) =>
  withProjectBuildGradle(config, (mod) => {
    mod.modResults.contents = androidNativePathsGradle(mod.modResults.contents);
    return mod;
  });

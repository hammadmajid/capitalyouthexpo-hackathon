import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const directory = new URL('../android/', import.meta.url);
if (!process.env.JAVA_HOME || !process.env.ANDROID_HOME || !existsSync(directory)) {
  process.stderr.write('Activate infra/android-env.ps1 and run android:prepare first.\n');
  process.exit(1);
}
const argumentsList = [
  ':app:assembleDebug',
  '--max-workers=1',
  '--no-daemon',
  '--no-configuration-cache',
  '--console=plain',
  '-PreactNativeArchitectures=arm64-v8a',
  '-Dorg.gradle.jvmargs=-Xmx1536m',
];
const windows = process.platform === 'win32';
const child = spawn(
  windows ? 'cmd.exe' : './gradlew',
  windows ? ['/d', '/s', '/c', 'gradlew.bat ' + argumentsList.join(' ')] : argumentsList,
  { cwd: directory, env: process.env, stdio: 'inherit' },
);
child.once('error', () => {
  process.stderr.write('Unable to start the Android Gradle wrapper.\n');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});

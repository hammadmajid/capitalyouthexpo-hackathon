import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { nativeUi, type NativeUiState } from './native-ui.ts';
const execute = promisify(execFile);
const devicePath = '/data/local/tmp/hsm-ci-private-ui.xml';
const options = { timeout: 10000, maxBuffer: 262144, encoding: 'utf8' as const };
// Called only by an explicitly running native integration flow, never by unit checks.
export async function observeNativeUi(): Promise<NativeUiState> {
  try {
    await execute('adb', ['shell', 'uiautomator', 'dump', devicePath], options);
    const { stdout } = await execute('adb', ['exec-out', 'cat', devicePath], options);
    return nativeUi(stdout);
  } catch {
    return 'unavailable';
  } finally {
    await execute('adb', ['shell', 'rm', '-f', devicePath], options).catch(() => undefined);
  }
}

import { spawn } from 'node:child_process';
import { NativeCommandFailure, nativeDiagnostic } from './native-diagnostics.ts';
export async function nativeCommand(
  executable: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
) {
  const child = spawn(executable, args, { env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let captured = '';
  let timedOut = false;
  const collect = (chunk: Buffer) => {
    captured = (captured + chunk.toString()).slice(-262144);
  };
  child.stdout?.on('data', collect);
  child.stderr?.on('data', collect);
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, 180000);
  try {
    await new Promise<void>((resolve, reject) => {
      child.once('error', () =>
        reject(new NativeCommandFailure({ failure: 'command_unavailable', action: 'unknown' })),
      );
      child.once('close', (code) =>
        code === 0
          ? resolve()
          : reject(new NativeCommandFailure(nativeDiagnostic(captured, timedOut))),
      );
    });
  } finally {
    clearTimeout(timeout);
  }
}

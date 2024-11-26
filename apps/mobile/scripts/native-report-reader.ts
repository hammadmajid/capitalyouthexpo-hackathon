import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { nativeReport, type NativeStep } from './native-report.ts';
// Raw tool reports remain private and are deleted by the caller even if parsing fails.
export async function readNativeStep(
  directory: string,
  depth = 0,
): Promise<NativeStep | undefined> {
  if (depth > 3) return undefined;
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    if (entries.length > 32) return undefined;
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        const step = await readNativeStep(path, depth + 1);
        if (step) return step;
      } else if (entry.isFile() && entry.name === 'commands.json') {
        if ((await stat(path)).size > 1048576) continue;
        const contents = await readFile(path, 'utf8');
        if (contents.length > 1048576) continue;
        const value: unknown = JSON.parse(contents);
        const step = nativeReport(value);
        if (step) return step;
      }
    }
  } catch {
    // Diagnostic failure must not hide the original integration failure.
  }
  return undefined;
}

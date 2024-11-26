import { expect, it } from 'vitest';
import { nativeCommand } from './native-command';
it('SEC-003: bounded native output retains the final failure without reflecting private data', async () => {
  const script =
    'process.stdout.write("private-value".repeat(30000), () => ' +
    'process.stderr.write("\\nEnter adult birth date\\nElement not found: private-value", ' +
    '() => process.exit(1)))';
  await expect(nativeCommand(process.execPath, ['-e', script])).rejects.toThrow(
    'Native command failed: assertion_failed; last input: birth_date',
  );
});

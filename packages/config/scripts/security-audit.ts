import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyDependencyIntegrity } from '../dependency-integrity.ts';
import { verifyAuditExecution, validateAuditReport } from '../security-audit-policy.ts';
async function scan() {
  const entry = process.env.npm_execpath;
  if (!entry || !/\.[cm]?js$/.test(entry)) throw new Error('Pinned pnpm executable unavailable');
  const child = spawn(
    process.execPath,
    [entry, 'audit', '--prod', '--audit-level', 'high', '--json'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString('utf8');
    if (output.length > 8 * 1024 * 1024) child.kill();
  });
  // Scanner failures are reported statically; never forward configuration or authentication diagnostics.
  child.stderr.on('data', () => undefined);
  const timeout = setTimeout(() => child.kill(), 120000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', () => reject(new Error('Security scanner unavailable')));
      child.once('close', resolve);
    });
    if ((code !== 0 && code !== 1) || output.length > 8 * 1024 * 1024)
      throw new Error('Security scanner failed');
    return { code, report: JSON.parse(output) as unknown };
  } finally {
    clearTimeout(timeout);
  }
}
try {
  verifyDependencyIntegrity();
  const scanned = await scan();
  validateAuditReport(scanned.report);
  const directory = fileURLToPath(new URL('../test-results', import.meta.url));
  await mkdir(directory, { recursive: true });
  await writeFile(directory + '/security-audit.json', JSON.stringify(scanned.report, null, 2));
  const result = verifyAuditExecution(scanned.report, scanned.code, new Date());
  await writeFile(directory + '/security-decision.json', JSON.stringify(result, null, 2));
  process.stdout.write(
    JSON.stringify({
      security: result.accepted.length
        ? 'PASS WITH VERIFIED TEMPORARY BACKPORT EXCEPTIONS'
        : 'PASS',
      ...result,
    }) + '\n',
  );
} catch {
  process.stderr.write(
    'Security verification failed: scanner, scope, expiry or backport integrity.\n',
  );
  process.exitCode = 1;
}

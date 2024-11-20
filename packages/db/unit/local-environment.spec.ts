import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { beforeAll, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let outcomes: string[] = [];
beforeAll(() => {
  const result = spawnSync(process.execPath, ['packages/db/unit/local-environment.fixture.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, NODE_NO_WARNINGS: '1', NODE_V8_COVERAGE: undefined },
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  outcomes = result.stdout.split(/\r?\n/).filter((line) => /^(ACCEPTED|REJECTED)$/.test(line));
}, 20000);

it('AUTH-C-002 / ADM-002: runtime validation needs no Root bootstrap password', () => {
  expect(outcomes[0]).toBe('ACCEPTED');
});

it('ADM-002: explicitly supplied partial bootstrap credentials remain invalid', () => {
  expect(outcomes[1]).toBe('REJECTED');
});

it('SEC-003: runtime validation still rejects missing security keys', () => {
  expect(outcomes[2]).toBe('REJECTED');
});

it('NTF-001: runtime validation still rejects a mismatched derived email key', () => {
  expect(outcomes[3]).toBe('REJECTED');
});

import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: root });
// Load the parser/plugins as suite setup, rather than charging cold disk I/O to one test.
beforeAll(async () => {
  await eslint.calculateConfigForFile(root + '/apps/api/src/probe.ts');
}, 120000);
async function rulesFor(source, file) {
  const [result] = await eslint.lintText(source, { filePath: root + '/' + file });
  return result.messages.map((message) => message.ruleId);
}
describe('SEC-001: repository lint safety gates', () => {
  it('rejects explicit any and console logging', async () => {
    const rules = await rulesFor(
      'export const unsafe: any = 1; console.log(unsafe);',
      'apps/api/src/probe.ts',
    );
    expect(rules).toContain('@typescript-eslint/no-explicit-any');
    expect(rules).toContain('no-console');
  });
  it('rejects app-to-app dependencies', async () => {
    expect(await rulesFor("import '../../web/README.md';", 'apps/api/src/probe.ts')).toContain(
      'boundaries/dependencies',
    );
  });
  it('rejects shared-package dependencies on apps', async () => {
    expect(
      await rulesFor("import '../../../apps/web/README.md';", 'packages/contracts/src/probe.ts'),
    ).toContain('boundaries/dependencies');
  });
  it('allows apps to import shared packages', async () => {
    expect(
      await rulesFor("import '../../../packages/config/prettier.mjs';", 'apps/api/src/probe.ts'),
    ).not.toContain('boundaries/dependencies');
  });
  it('enforces design tokens in application code', async () => {
    expect(await rulesFor("export const color = '#145660';", 'apps/web/src/probe.ts')).toContain(
      'foundation/no-app-hex',
    );
  });
  it('warns at 300 code lines and rejects more than 500', async () => {
    const source = Array.from(
      { length: 501 },
      (_, index) => `export const value${index} = ${index};`,
    ).join('\n');
    const rules = await rulesFor(source, 'apps/api/src/probe.ts');
    expect(rules).toContain('foundation/file-size-target');
    expect(rules).toContain('max-lines');
  });
});

describe('SEC-001: CSS design-token policy', () => {
  it('parses Tailwind directives and shared token references', async () => {
    expect(
      await rulesFor(
        '@tailwind base; a { @apply hover:underline focus-visible:outline; color: var(--color-primary); }',
        'apps/web/src/probe.css',
      ),
    ).toEqual([]);
  });
  it('rejects CSS hex colors while allowing ID selectors', async () => {
    expect(await rulesFor('#abc { color: #fff; }', 'apps/web/src/probe.css')).toContain(
      'foundation/no-app-hex',
    );
    expect(
      await rulesFor('#abc { color: var(--color-primary); }', 'apps/web/src/probe.css'),
    ).toEqual([]);
  });
});

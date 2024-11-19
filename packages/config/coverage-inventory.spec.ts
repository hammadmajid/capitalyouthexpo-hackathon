import { expect, it } from 'vitest';
import { inventoryCoverageSources } from './coverage-inventory.ts';
it.each([
  ['apps/api/src/main.ts', 'start();'],
  ['apps/web/src/app/page.tsx', 'export default () => <main />;'],
  ['apps/mobile/src/lib/runtime.ts', 'export const client = createClient();'],
  ['apps/worker/src/main.ts', "import './worker.js';"],
  ['packages/db/src/schema/index.ts', "export * from './users.js';"],
  ['packages/api-client/src/generated/runtime.ts', 'export const generated = 1;'],
  ['packages/contracts/src/schema.ts', 'export enum Runtime { Value }'],
  ['packages/ui/src/index.js', 'export const token = 1;'],
])('SEC-001 Phase 1: runtime source remains in aggregate denominator (%s)', (path, contents) => {
  const inventory = inventoryCoverageSources([{ path, contents }]);
  expect([...inventory.executable.keys()]).toEqual([path]);
  expect(inventory.excluded.size).toBe(0);
});
it.each([
  ['docs/example.ts', 'Outside product source'],
  ['packages/config/coverage-inventory.ts', 'Outside product source'],
  ['packages/test-support/src/fixture.ts', 'Test infrastructure'],
  ['apps/api/src/thing.spec.ts', 'Test source'],
  ['apps/web/src/__tests__/page.tsx', 'Test source'],
  ['packages/db/src/__fixtures__/seed.ts', 'Test source'],
  ['apps/api/src/test-results/output.js', 'Test source'],
  ['apps/mobile/src/thing.test.tsx', 'Test source'],
  ['packages/api-client/src/generated/schema.d.ts', 'Declaration source'],
  ['packages/contracts/src/types.d.mts', 'Declaration source'],
  ['apps/web/src/app/style.css', 'Non-JavaScript source'],
])('SEC-001 Phase 1: non-product/non-executable exclusions are explicit (%s)', (path, reason) => {
  const inventory = inventoryCoverageSources([{ path, contents: 'export const x = 1;' }]);
  expect(inventory.executable.size).toBe(0);
  expect(inventory.excluded.get(path)).toBe(reason);
});
it.each([
  'export interface Identity { id: string }',
  'export type Identity = string;',
  "import type { Identity } from './identity.js'; export type { Identity };",
  '/* documentation */ export {};',
  'declare function external(): void;',
  '',
])(
  'SEC-001 Phase 1: declaration-only classification uses emitted code, not filename guessing (%#)',
  (contents) => {
    const inventory = inventoryCoverageSources([
      { path: 'packages/contracts/src/identity.ts', contents },
    ]);
    expect(inventory.excluded.get('packages/contracts/src/identity.ts')).toBe(
      'No emitted executable JavaScript',
    );
  },
);
it('SEC-001 Phase 1: Windows paths normalize and physical line bounds remain available', () => {
  const inventory = inventoryCoverageSources([
    { path: 'apps\\api\\src\\main.ts', contents: 'start();\r\nnext();\r\n' },
  ]);
  expect(inventory.executable.get('apps/api/src/main.ts')).toBe(3);
});
it.each([
  '/apps/api/src/main.ts',
  'C:/repo/main.ts',
  '../apps/api/src/main.ts',
  'apps//api/src/main.ts',
  'apps/./api/src/main.ts',
])('SEC-001 Phase 1: invalid inventory paths fail closed (%s)', (path) => {
  expect(() => inventoryCoverageSources([{ path, contents: 'start();' }])).toThrow(
    'Invalid or duplicate coverage source path',
  );
});
it('SEC-001 Phase 1: duplicate normalized source paths cannot shrink the denominator', () => {
  expect(() =>
    inventoryCoverageSources([
      { path: 'apps/api/src/main.ts', contents: 'start();' },
      { path: 'apps\\api\\src\\main.ts', contents: 'other();' },
    ]),
  ).toThrow('Invalid or duplicate coverage source path');
});

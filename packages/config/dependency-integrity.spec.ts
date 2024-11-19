import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { verifyDependencyIntegrity } from './dependency-integrity.ts';
it('SEC-001: installed security backports match the committed reviewed post-images', () => {
  expect(() => verifyDependencyIntegrity()).not.toThrow();
});
it.each(['rsa.js', 'compile.js', 'expand.js', 'parse.js', 'stringify.js', 'utils.js', '.patch'])(
  'SEC-001: altered dependency code or patch cannot use the audit exception: %s',
  (suffix) => {
    expect(() =>
      verifyDependencyIntegrity(
        (path) =>
          readFileSync(path, 'utf8') + (path.endsWith(suffix) ? '\n// altered fixture' : ''),
      ),
    ).toThrow('backport integrity');
  },
);
it('SEC-001: unreadable or invalid backport metadata fails closed', () => {
  expect(() => verifyDependencyIntegrity(() => '{}')).toThrow('backport integrity');
  expect(() =>
    verifyDependencyIntegrity(() => {
      throw new Error('Unavailable');
    }),
  ).toThrow('backport integrity');
});

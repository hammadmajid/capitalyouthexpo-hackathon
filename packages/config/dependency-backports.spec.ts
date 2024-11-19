import { constants, createHash, generateKeyPairSync, privateEncrypt, sign } from 'node:crypto';
import { expect, it } from 'vitest';
import { cli, braceRequire } from './dependency-runtime.js';
interface Forge {
  pki: { publicKeyFromPem(pem: string): { verify(digest: string, signature: string): boolean } };
}
interface Braces {
  parse(input: string): unknown;
  compile(input: unknown): string;
  expand(input: unknown): string[];
  stringify(input: unknown): string;
}
const forge = cli('node-forge') as Forge;
const braces = braceRequire('braces') as Braces;
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicExponent: 3,
});
const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const publicForge = forge.pki.publicKeyFromPem(pem);
const message = Buffer.from('SEC-001 public signature regression message');
const digest = createHash('sha256').update(message).digest();
function malformed(prefix: string) {
  const encoded = Buffer.concat([Buffer.from(prefix, 'hex'), digest]);
  const block = Buffer.concat([
    Buffer.from([0, 1]),
    Buffer.alloc(256 - encoded.length - 3, 255),
    Buffer.from([0]),
    encoded,
  ]);
  return privateEncrypt({ key: privateKey, padding: constants.RSA_NO_PADDING }, block).toString(
    'binary',
  );
}
it('SEC-001 GHSA-86w9: rejects extra nested DigestAlgorithm elements with a low-exponent key', () => {
  expect(() =>
    publicForge.verify(
      digest.toString('binary'),
      malformed('30343010060960864801650304020105000401ff0420'),
    ),
  ).toThrow('DigestInfo');
});
it('SEC-001 GHSA-86w9: rejects nonempty NULL algorithm parameters', () => {
  expect(() =>
    publicForge.verify(
      digest.toString('binary'),
      malformed('3032300e06096086480165030402010501ff0420'),
    ),
  ).toThrow('DigestInfo');
});
it('SEC-001: accepts valid native RSA/SHA256 signatures after the backport', () => {
  const signature = sign('sha256', message, privateKey);
  expect(publicForge.verify(digest.toString('binary'), signature.toString('binary'))).toBe(true);
});
const deep = '{'.repeat(4000) + 'a,b' + '}'.repeat(4000);
it.each(['parse', 'compile', 'expand', 'stringify'] as const)(
  'SEC-001 GHSA-vfj7: bounds deeply nested patterns in %s',
  (operation) => {
    expect(() => braces[operation](deep)).toThrow('Brace nesting exceeds the safety limit');
  },
);
interface Ast {
  type: string;
  nodes: Ast[];
  parent?: Ast;
}
function nestedAst() {
  const root: Ast = { type: 'root', nodes: [] };
  let current = root;
  for (let depth = 0; depth < 5000; depth++) {
    const child: Ast = { type: 'root', nodes: [], parent: current };
    current.nodes.push(child);
    current = child;
  }
  return root;
}
it.each(['compile', 'expand', 'stringify'] as const)(
  'SEC-001 GHSA-vfj7: direct AST input cannot bypass %s depth guards',
  (operation) => {
    expect(() => braces[operation](nestedAst())).toThrow('Brace nesting exceeds the safety limit');
  },
);
it('SEC-001 GHSA-vfj7: flatten rejects deeply nested expansion queues', () => {
  const utils = braceRequire('./lib/utils.js') as { flatten(input: unknown): unknown[] };
  let input: unknown = 'a';
  for (let depth = 0; depth < 5000; depth++) input = [input];
  expect(() => utils.flatten(input)).toThrow('Brace nesting exceeds the safety limit');
});
it('SEC-001: normal Metro brace glob patterns retain compilation and expansion', () => {
  expect(braces.compile('src/{app,lib}/*.{ts,tsx}')).toBe('src/(app|lib)/*.(ts|tsx)');
  expect(braces.expand('src/{app,lib}/*.{ts,tsx}')).toEqual([
    'src/app/*.ts',
    'src/app/*.tsx',
    'src/lib/*.ts',
    'src/lib/*.tsx',
  ]);
  expect(braces.stringify(braces.parse('src/{app,lib}'))).toBe('src/{app,lib}');
});

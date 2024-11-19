import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
it('SEC-001: real HTTP byte uploads remain compatible with browser/native test globals', () => {
  const configFile = fileURLToPath(new URL('./tsconfig.json', import.meta.url));
  const fixture = fileURLToPath(new URL('./type-fixtures/node-fetch.ts', import.meta.url));
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  const options = ts.parseJsonConfigFileContent(
    config.config as unknown,
    ts.sys,
    fileURLToPath(new URL('.', import.meta.url)),
  );
  const program = ts.createProgram([fixture], { ...options.options, noEmit: true });
  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  expect(diagnostics).toEqual([]);
}, 60000);

import ts from 'typescript';
export interface CoverageSource {
  readonly path: string;
  readonly contents: string;
}
export interface CoverageInventory {
  readonly executable: ReadonlyMap<string, number>;
  readonly excluded: ReadonlyMap<string, string>;
}
function declarationOnly(source: CoverageSource) {
  const output = ts.transpileModule(source.contents, {
    fileName: source.path,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      removeComments: true,
    },
  }).outputText;
  return output.replace(/export\s*\{\s*\}\s*;?/g, '').trim().length === 0;
}
function exclusion(source: CoverageSource): string | undefined {
  if (!/^(apps|packages)\/[^/]+\/src\//.test(source.path)) return 'Outside product source';
  if (source.path.startsWith('packages/test-support/')) return 'Test infrastructure';
  if (
    /(^|\/)(__tests__|__fixtures__|test-results)\//.test(source.path) ||
    /\.(spec|test)\.[cm]?[jt]sx?$/.test(source.path)
  )
    return 'Test source';
  if (/\.d\.[cm]?ts$/.test(source.path)) return 'Declaration source';
  if (!/\.[cm]?[jt]sx?$/.test(source.path)) return 'Non-JavaScript source';
  if (declarationOnly(source)) return 'No emitted executable JavaScript';
  return undefined;
}
export function normalizeCoverageSourcePath(value: string) {
  const path = value.replaceAll('\\', '/');
  if (
    path.startsWith('/') ||
    path.includes(':') ||
    path.split('/').some((part) => !part || part === '.' || part === '..')
  )
    throw new Error('Invalid or duplicate coverage source path');
  return path;
}
// Inventory uses every supplied product source, including entrypoints, barrels and adapters.
export function inventoryCoverageSources(sources: readonly CoverageSource[]): CoverageInventory {
  const executable = new Map<string, number>();
  const excluded = new Map<string, string>();
  for (const input of sources) {
    const path = normalizeCoverageSourcePath(input.path);
    if (executable.has(path) || excluded.has(path))
      throw new Error('Invalid or duplicate coverage source path');
    const source = { path, contents: input.contents };
    const reason = exclusion(source);
    if (reason) excluded.set(path, reason);
    else executable.set(path, source.contents.split(/\r?\n/).length);
  }
  return { executable, excluded };
}

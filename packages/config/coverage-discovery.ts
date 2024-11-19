import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve, relative, sep, join } from 'node:path';
import { inventoryCoverageSources, type CoverageSource } from './coverage-inventory.ts';
export function insideWorkspace(root: string, path: string) {
  const base = resolve(root),
    target = resolve(base, path),
    part = relative(base, target);
  if (!part || part === '..' || part.startsWith('..' + sep) || resolve(part) === part)
    throw new Error('Coverage path escapes the workspace');
  return target;
}
async function directory(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink())
      throw new Error('Coverage source symlink is not allowed');
    return await readdir(path, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}
async function walk(root: string, path: string, sources: CoverageSource[]) {
  for (const entry of await directory(path)) {
    const target = insideWorkspace(root, join(path, entry.name));
    if (entry.isSymbolicLink()) throw new Error('Coverage source symlink is not allowed');
    if (entry.isDirectory()) await walk(root, target, sources);
    else if (entry.isFile())
      sources.push({
        path: relative(root, target).split(sep).join('/'),
        contents: await readFile(target, 'utf8'),
      });
  }
}
export async function discoverCoverageSources(root: string) {
  const sources: CoverageSource[] = [];
  for (const scope of ['apps', 'packages']) {
    for (const project of await directory(insideWorkspace(root, scope))) {
      if (project.isSymbolicLink()) throw new Error('Coverage project symlink is not allowed');
      if (!project.isDirectory()) continue;
      const src = insideWorkspace(root, join(scope, project.name, 'src'));
      await walk(root, src, sources);
    }
  }
  if (inventoryCoverageSources(sources).executable.size === 0)
    throw new Error('No executable product source');
  return sources.sort((a, b) => a.path.localeCompare(b.path));
}

import { relative, resolve, sep, isAbsolute, posix } from 'node:path';
import {
  parseLineCoverage,
  mergeLineCoverage,
  CoverageFormatError,
  type SourceLineCoverage,
} from './coverage-lcov.ts';
import type { CoverageInventory } from './coverage-inventory.ts';
import { insideWorkspace } from './coverage-discovery.ts';
export function canonicalCoverageReport(
  root: string,
  project: string,
  report: string,
  inventory: CoverageInventory,
) {
  const records: SourceLineCoverage[] = [];
  for (const record of parseLineCoverage(report)) {
    const input = record.file.replaceAll('\\', '/');
    const target =
      isAbsolute(record.file) || /^[A-Za-z]:/.test(input)
        ? insideWorkspace(root, record.file)
        : insideWorkspace(root, posix.join(project, input));
    const file = relative(resolve(root), target).split(sep).join('/');
    if (!inventory.executable.has(file) && !inventory.excluded.has(file))
      throw new CoverageFormatError();
    records.push({ file, lines: record.lines });
  }
  return records;
}
export function serializeCoverageReport(records: readonly SourceLineCoverage[]) {
  const merged = mergeLineCoverage(records);
  if (merged.files.size === 0) throw new CoverageFormatError();
  return (
    [...merged.files]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, lines]) => {
        if (/\r|\n/.test(file)) throw new CoverageFormatError();
        return [
          'SF:' + file,
          ...[...lines].sort(([a], [b]) => a - b).map(([line, hits]) => 'DA:' + line + ',' + hits),
          'LF:' + lines.size,
          'LH:' + [...lines.values()].filter((hits) => hits > 0).length,
          'end_of_record',
        ].join('\n');
      })
      .join('\n') + '\n'
  );
}

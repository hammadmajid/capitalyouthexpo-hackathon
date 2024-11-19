import {
  CoverageFormatError,
  mergeLineCoverage,
  type SourceLineCoverage,
} from './coverage-lcov.ts';
import type { CoverageInventory } from './coverage-inventory.ts';
export class AggregateCoverageError extends Error {
  constructor() {
    super('Aggregate coverage evidence is incomplete or below the required 80%');
    this.name = 'AggregateCoverageError';
  }
}
// Call only after producer revision/source provenance and report paths are verified.
export function requireAggregateCoverage(
  records: readonly SourceLineCoverage[],
  inventory: CoverageInventory,
) {
  const product: SourceLineCoverage[] = [];
  const represented = new Set<string>();
  for (const record of records) {
    const file = record.file.replaceAll('\\', '/');
    const bound = inventory.executable.get(file);
    if (bound === undefined) {
      if (inventory.excluded.has(file) && record.lines.size === 0) continue;
      throw new CoverageFormatError();
    }
    for (const [line, hits] of record.lines) {
      if (
        !Number.isSafeInteger(line) ||
        line < 1 ||
        line > bound ||
        !Number.isSafeInteger(hits) ||
        hits < 0
      )
        throw new CoverageFormatError();
    }
    if (record.lines.size === 0) throw new AggregateCoverageError();
    represented.add(file);
    product.push({ file, lines: record.lines });
  }
  if (represented.size !== inventory.executable.size) throw new AggregateCoverageError();
  const result = mergeLineCoverage(product);
  if (result.percent === null || result.percent < 80) throw new AggregateCoverageError();
  return result;
}

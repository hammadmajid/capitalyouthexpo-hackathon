import { mergeLineCoverage, type SourceLineCoverage } from './coverage-lcov.ts';
import { requireAggregateCoverage } from './coverage-gate.ts';
import type { CoverageInventory } from './coverage-inventory.ts';
const scopes = [
  { name: 'booking', prefix: 'apps/api/src/booking/' },
  { name: 'inventory', prefix: 'apps/api/src/inventory/' },
  { name: 'marketplace', prefix: 'apps/api/src/marketplace/' },
  { name: 'inbox', prefix: 'apps/api/src/inbox/' },
  {
    name: 'reservations',
    files: [
      'packages/db/src/inventory-expiry.ts',
      'packages/db/src/inventory-lock.ts',
      'packages/db/src/booking-lifecycle.ts',
    ],
  },
  { name: 'notifications', prefix: 'packages/notifications/src/' },
] as const;
export class PhaseTwoCoverageError extends Error {
  readonly scope: string;
  constructor(scope: string) {
    super('Phase 2 business coverage is incomplete or below 90%: ' + scope);
    this.name = 'PhaseTwoCoverageError';
    this.scope = scope;
  }
}
// Same-revision provenance must be checked first. Revalidate the unchanged whole-app gate.
export function requirePhaseTwoCoverage(
  records: readonly SourceLineCoverage[],
  inventory: CoverageInventory,
) {
  const whole = requireAggregateCoverage(records, inventory),
    reports = [];
  for (const scope of scopes) {
    const names =
      'prefix' in scope
        ? [...inventory.executable.keys()].filter((file) => file.startsWith(scope.prefix))
        : [...scope.files];
    if (names.length === 0 || names.some((file) => !inventory.executable.has(file)))
      throw new PhaseTwoCoverageError(scope.name);
    const selected = names.map((file) => {
      const lines = whole.files.get(file);
      if (!lines) throw new PhaseTwoCoverageError(scope.name);
      return { file, lines };
    });
    const result = mergeLineCoverage(selected);
    if (result.percent === null || result.percent < 90) throw new PhaseTwoCoverageError(scope.name);
    reports.push({
      scope: scope.name,
      files: result.files.size,
      found: result.found,
      hit: result.hit,
      percent: result.percent,
    });
  }
  return reports;
}

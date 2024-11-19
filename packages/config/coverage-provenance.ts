import { createHash } from 'node:crypto';
import { z } from 'zod';
import { normalizeCoverageSourcePath, type CoverageSource } from './coverage-inventory.ts';
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const stateSchema = z
  .object({ revision: z.string().regex(/^[a-f0-9]{40}$/), sourceHash: digest })
  .strict();
const producerSchema = z.enum(['quality', 'infrastructure']);
const manifestSchema = stateSchema
  .extend({ version: z.literal(1), producer: producerSchema, reportHash: digest })
  .strict();
export type CoverageState = z.infer<typeof stateSchema>;
export type CoverageManifest = z.infer<typeof manifestSchema>;
export type CoverageProducer = z.infer<typeof producerSchema>;
export class CoverageEvidenceError extends Error {
  constructor() {
    super('Coverage revision, source, report or producer evidence is invalid');
    this.name = 'CoverageEvidenceError';
  }
}
function state(value: unknown) {
  const parsed = stateSchema.safeParse(value);
  if (!parsed.success) throw new CoverageEvidenceError();
  return parsed.data;
}
function reportHash(report: string) {
  return createHash('sha256').update(report, 'utf8').digest('hex');
}
export function fingerprintCoverageSources(sources: readonly CoverageSource[]) {
  const entries = new Map<string, string>();
  for (const source of sources) {
    const path = normalizeCoverageSourcePath(source.path);
    if (entries.has(path)) throw new CoverageEvidenceError();
    entries.set(path, source.contents);
  }
  const hash = createHash('sha256').update('hsm-coverage-source-v1\n');
  for (const entry of [...entries].sort(([left], [right]) => (left < right ? -1 : 1)))
    hash.update(JSON.stringify(entry), 'utf8').update('\n');
  return hash.digest('hex');
}
// Producer calls this only following a successful task and a fresh report read.
export function createCoverageManifest(
  producer: CoverageProducer,
  before: CoverageState,
  after: CoverageState,
  report: string,
): CoverageManifest {
  const initial = state(before),
    final = state(after);
  if (
    initial.revision !== final.revision ||
    initial.sourceHash !== final.sourceHash ||
    !producerSchema.safeParse(producer).success
  )
    throw new CoverageEvidenceError();
  return { version: 1, producer, ...final, reportHash: reportHash(report) };
}
export function verifyCoverageManifest(
  value: unknown,
  expected: CoverageState,
  producer: CoverageProducer,
  report: string,
): CoverageManifest {
  const parsed = manifestSchema.safeParse(value),
    current = state(expected);
  if (!parsed.success) throw new CoverageEvidenceError();
  const manifest = parsed.data;
  if (
    manifest.revision !== current.revision ||
    manifest.sourceHash !== current.sourceHash ||
    manifest.producer !== producer ||
    manifest.reportHash !== reportHash(report)
  )
    throw new CoverageEvidenceError();
  return manifest;
}
export function requireCoverageProducers(values: readonly CoverageManifest[]) {
  const seen = new Set<CoverageProducer>();
  for (const value of values) {
    const parsed = manifestSchema.safeParse(value);
    if (!parsed.success || seen.has(parsed.data.producer)) throw new CoverageEvidenceError();
    seen.add(parsed.data.producer);
  }
  if (seen.size !== 2) throw new CoverageEvidenceError();
}

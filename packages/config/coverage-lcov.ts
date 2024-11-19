// Phase 1 Task 3 / SEC-001: reject malformed evidence before aggregate coverage gating.
export interface SourceLineCoverage {
  readonly file: string;
  readonly lines: ReadonlyMap<number, number>;
}
interface RecordState {
  file: string;
  lines: Map<number, number>;
  found: number | undefined;
  hit: number | undefined;
}
export class CoverageFormatError extends Error {
  constructor() {
    super('Invalid or incomplete line coverage evidence');
    this.name = 'CoverageFormatError';
  }
}
function integer(value: string | undefined) {
  if (!value || !/^(0|[1-9]\d*)$/.test(value)) throw new CoverageFormatError();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new CoverageFormatError();
  return parsed;
}
function addLine(record: RecordState, row: string) {
  const parts = row.slice(3).split(',');
  if (parts.length < 2 || parts.length > 3 || (parts.length === 3 && !parts[2]))
    throw new CoverageFormatError();
  const line = integer(parts[0]),
    hits = integer(parts[1]);
  if (line === 0 || record.lines.has(line)) throw new CoverageFormatError();
  record.lines.set(line, hits);
}
function totals(record: RecordState, row: string) {
  if (row.startsWith('LF:')) {
    if (record.found !== undefined) throw new CoverageFormatError();
    record.found = integer(row.slice(3));
  } else {
    if (record.hit !== undefined) throw new CoverageFormatError();
    record.hit = integer(row.slice(3));
  }
}
function finish(record: RecordState): SourceLineCoverage {
  const hits = [...record.lines.values()].filter((value) => value > 0).length;
  if (record.found !== record.lines.size || record.hit !== hits) throw new CoverageFormatError();
  return { file: record.file, lines: new Map(record.lines) };
}
function consume(record: RecordState, row: string) {
  if (row.startsWith('DA:')) return addLine(record, row);
  if (row.startsWith('LF:') || row.startsWith('LH:')) return totals(record, row);
  if (!/^(FN|FNDA|FNF|FNH|BRDA|BRF|BRH|VER):/.test(row)) throw new CoverageFormatError();
}
export function parseLineCoverage(contents: string): SourceLineCoverage[] {
  const records: SourceLineCoverage[] = [];
  let current: RecordState | undefined;
  for (const row of contents.split(/\r?\n/)) {
    if (!row || row.startsWith('TN:')) continue;
    if (row.startsWith('SF:')) {
      if (current || !row.slice(3).trim()) throw new CoverageFormatError();
      current = { file: row.slice(3), lines: new Map(), found: undefined, hit: undefined };
    } else if (row === 'end_of_record') {
      if (!current) throw new CoverageFormatError();
      records.push(finish(current));
      current = undefined;
    } else {
      if (!current) throw new CoverageFormatError();
      consume(current, row);
    }
  }
  if (current || records.length === 0) throw new CoverageFormatError();
  return records;
}
export function mergeLineCoverage(records: readonly SourceLineCoverage[]) {
  const files = new Map<string, Map<number, number>>();
  for (const record of records) {
    const lines = files.get(record.file) ?? new Map<number, number>();
    for (const [line, hits] of record.lines) lines.set(line, Math.max(lines.get(line) ?? 0, hits));
    files.set(record.file, lines);
  }
  let found = 0,
    hit = 0;
  for (const lines of files.values()) {
    found += lines.size;
    hit += [...lines.values()].filter((hits) => hits > 0).length;
  }
  return { files, found, hit, percent: found === 0 ? null : (hit * 100) / found };
}

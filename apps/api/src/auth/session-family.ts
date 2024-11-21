export interface SessionLineage {
  id: string;
  replacedBySessionId: string | null;
}
// SEC: a rotation chain is a family; siblings and unrelated devices are separate.
export function sessionFamily(rows: readonly SessionLineage[], sessionId: string): Set<string> {
  const family = new Set([sessionId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      const next = row.replacedBySessionId;
      if (
        (family.has(row.id) || (next !== null && family.has(next))) &&
        (!family.has(row.id) || (next !== null && !family.has(next)))
      ) {
        family.add(row.id);
        if (next !== null) family.add(next);
        changed = true;
      }
    }
  }
  return family;
}

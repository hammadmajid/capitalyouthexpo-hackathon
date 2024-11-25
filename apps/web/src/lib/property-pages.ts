// BRN-001: aggregate real bounded pages for hierarchy counts, without silently
// truncating properties at 100 buildings/floors. Broken continuation fails closed.
export async function collectPropertyPages<
  T extends { id: string },
  P extends {
    data: T[];
    nextCursor: string | null;
    canEdit: boolean;
  },
>(read: (cursor?: string) => Promise<P>) {
  const first = await read();
  const data = [...first.data];
  const seen = new Set(data.map((row) => row.id));
  const cursors = new Set<string>();
  let cursor = first.nextCursor,
    canEdit = first.canEdit;
  while (cursor) {
    if (cursors.has(cursor)) throw new Error('Property continuation unavailable');
    cursors.add(cursor);
    const page = await read(cursor);
    for (const row of page.data) {
      if (seen.has(row.id)) throw new Error('Duplicate property record');
      seen.add(row.id);
      data.push(row);
    }
    canEdit = canEdit && page.canEdit;
    cursor = page.nextCursor;
  }
  return { ...first, data: data as P['data'], canEdit, nextCursor: null };
}

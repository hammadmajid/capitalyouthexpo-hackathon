// CHG-032/033: load every named Islamabad/Rawalpindi place from OpenStreetMap.
// Usage (after `pnpm turbo run build --filter=@hsm/api`):
//   node --env-file=../../.env scripts/import-institutions.ts            (fetch live)
//   node --env-file=../../.env scripts/import-institutions.ts --from <dir> (isb.json, rwp.json)
// Data © OpenStreetMap contributors, ODbL. Safe to rerun: existing places are skipped.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { adminAccounts, createDatabase } from '@hsm/db';
import { parseOsmInstitutions } from '../dist/marketplace/osm-institutions.js';
import { InstitutionImportRepository } from '../dist/marketplace/institution-import.repository.js';

const sources = [
  // OpenStreetMap area ids: Islamabad Capital Territory, Rawalpindi City Tehsil.
  { file: 'isb.json', city: 'islamabad', area: 3600358002 },
  { file: 'rwp.json', city: 'rawalpindi', area: 3621187806 },
] as const;
const endpoint = 'https://overpass-api.de/api/interpreter';
// Every named amenity, shop, office, stay, health place and locality (G-10, F-8, ...).
const query = (area: number) =>
  `[out:json][timeout:240];area(${area})->.a;` +
  'nwr(area.a)[name][~"^(amenity|shop|office|tourism|healthcare|place)$"~"."];out center tags;';

async function fetchArea(area: number): Promise<unknown> {
  let wait = 15_000;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'hsm-import' },
      body: new URLSearchParams({ data: query(area) }),
    });
    if (response.ok) return response.json();
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait *= 2;
  }
  throw new Error('OpenStreetMap is busy; try again later or use --from');
}

async function main() {
  const fromIndex = process.argv.indexOf('--from');
  const from = fromIndex > 0 ? process.argv[fromIndex + 1] : undefined;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const { db, close } = createDatabase(url);
  try {
    const roots = await db
      .select({ userId: adminAccounts.userId })
      .from(adminAccounts)
      .where(and(eq(adminAccounts.isRoot, true), eq(adminAccounts.status, 'active')));
    const [root] = roots;
    if (!root || roots.length !== 1) throw new Error('Exactly one active Root admin is required');
    const actor = { userId: root.userId, sessionId: v7() };
    const importer = new InstitutionImportRepository();
    for (const source of sources) {
      const payload = from
        ? JSON.parse(await readFile(join(from, source.file), 'utf8'))
        : await fetchArea(source.area);
      const candidates = parseOsmInstitutions(payload);
      const counts = await db.transaction((tx) =>
        importer.import(tx, actor, source.city, candidates),
      );
      process.stdout.write(
        `${source.city}: ${candidates.length} found, ${counts.added} added, ${counts.skipped} already there\n`,
      );
    }
  } finally {
    await close();
  }
}
await main();

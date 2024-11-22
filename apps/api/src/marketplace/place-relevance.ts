import { sql } from 'drizzle-orm';
import { places } from '@hsm/db';
// CHG-033: exact names first, then names that start with the text, then shorter names,
// so "G-10" finds the G-10 sector before "G-10 Markaz Pharmacy".
export function placeRelevance(text: string) {
  const term = text.trim().toLowerCase();
  const prefix = term.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_') + '%';
  return [
    sql`case when lower(${places.name}) = ${term} or lower(${places.shortName}) = ${term} then 0
 when lower(${places.name}) like ${prefix} then 1 else 2 end`,
    sql`case when ${places.type} = 'locality' then 0 else 1 end`,
    sql`length(${places.name})`,
  ];
}

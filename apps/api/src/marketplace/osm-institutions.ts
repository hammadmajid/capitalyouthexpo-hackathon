import { z } from 'zod';
// CHG-032/033: searchable places come from OpenStreetMap (ODbL) instead of manual entry.
// Overpass output is untrusted input, so it is validated and normalized before any write.
const tagsSchema = z.record(z.string(), z.string()).default({});
const elementSchema = z.object({
  type: z.enum(['node', 'way', 'relation', 'area']),
  id: z.number().int().positive(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  tags: tagsSchema,
});
export const overpassResponseSchema = z.object({ elements: z.array(elementSchema) });
export type PlaceKind =
  | 'university'
  | 'school'
  | 'health'
  | 'hotel'
  | 'food'
  | 'government'
  | 'library'
  | 'office'
  | 'business_hub'
  | 'locality';
export type OsmInstitution = {
  sourceRef: string;
  type: PlaceKind;
  name: string;
  shortName: string | null;
  address: string | null;
  aliases: string[];
  latitude: number;
  longitude: number;
};
const amenityKinds: Record<string, PlaceKind> = {
  university: 'university',
  college: 'university',
  school: 'school',
  kindergarten: 'school',
  language_school: 'school',
  music_school: 'school',
  driving_school: 'school',
  training: 'school',
  hospital: 'health',
  clinic: 'health',
  doctors: 'health',
  dentist: 'health',
  pharmacy: 'health',
  restaurant: 'food',
  cafe: 'food',
  fast_food: 'food',
  food_court: 'food',
  library: 'library',
  townhall: 'government',
  courthouse: 'government',
  police: 'government',
  post_office: 'government',
  embassy: 'government',
  bank: 'business_hub',
  marketplace: 'business_hub',
};
const governmentOffices = new Set(['government', 'administrative', 'diplomatic']);
const stays = new Set(['hotel', 'guest_house', 'motel', 'hostel', 'apartment']);
const localities = new Set(['suburb', 'neighbourhood', 'quarter', 'village', 'hamlet', 'town']);
// The first matching tag decides the category; anything else (benches, parking) is ignored.
export function placeKind(tags: Record<string, string>): PlaceKind | undefined {
  const amenity = tags.amenity ?? '';
  if (amenityKinds[amenity]) return amenityKinds[amenity];
  if (tags.healthcare) return 'health';
  if (stays.has(tags.tourism ?? '')) return 'hotel';
  if (tags.office) return governmentOffices.has(tags.office) ? 'government' : 'office';
  if (tags.shop) return 'business_hub';
  if (localities.has(tags.place ?? '')) return 'locality';
  return undefined;
}
const clean = (value: string | undefined) => value?.replace(/\s+/g, ' ').trim() ?? '';
const fits = (value: string) => value.length >= 2 && value.length <= 120;
const key = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
function addressOf(tags: Record<string, string>) {
  const parts = [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb']]
    .map(clean)
    .filter(Boolean);
  const address = parts.join(', ');
  return address && address.length <= 300 ? address : null;
}
function aliasesOf(tags: Record<string, string>, name: string, shortName: string | null) {
  const taken = new Set([key(name), ...(shortName ? [key(shortName)] : [])]);
  const out: string[] = [];
  for (const tag of ['name', 'alt_name', 'old_name', 'official_name', 'name:ur']) {
    for (const part of (tags[tag] ?? '').split(';').map(clean)) {
      if (!fits(part) || taken.has(key(part)) || !key(part)) continue;
      taken.add(key(part));
      out.push(part);
    }
  }
  return out.slice(0, 10);
}
function shortNameOf(tags: Record<string, string>, name: string) {
  const short = clean(tags.short_name);
  return fits(short) && short.length <= 40 && key(short) !== key(name) ? short : null;
}
// Named places with a usable point are kept. The same name ~100 m apart is one place;
// chains such as one restaurant brand keep each separate branch.
export function parseOsmInstitutions(payload: unknown): OsmInstitution[] {
  const { elements } = overpassResponseSchema.parse(payload);
  const seen = new Set<string>();
  const out: OsmInstitution[] = [];
  for (const element of elements) {
    if (element.type === 'area') continue;
    const type = placeKind(element.tags);
    const name = clean(element.tags['name:en']) || clean(element.tags.name);
    const latitude = element.center?.lat ?? element.lat;
    const longitude = element.center?.lon ?? element.lon;
    if (!type || !fits(name) || !key(name)) continue;
    if (latitude === undefined || longitude === undefined) continue;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const spot = key(name) + '@' + latitude.toFixed(3) + ',' + longitude.toFixed(3);
    if (seen.has(spot)) continue;
    seen.add(spot);
    const shortName = shortNameOf(element.tags, name);
    out.push({
      sourceRef: element.type + '/' + element.id,
      type,
      name,
      shortName,
      address: addressOf(element.tags),
      aliases: aliasesOf(element.tags, name, shortName),
      latitude,
      longitude,
    });
  }
  return out;
}

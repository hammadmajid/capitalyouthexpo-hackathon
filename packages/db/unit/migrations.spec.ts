import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { z } from 'zod';
import * as enums from '../src/schema/enums.js';
import * as schema from '../src/schema/index.js';

const folder = fileURLToPath(new URL('../migrations/', import.meta.url));
const sql = readFileSync(folder + '0001_phase_one_foundations.sql', 'utf8');
const definitions = Object.values(enums);
const laterPlaceCategories = [
  'school',
  'health',
  'hotel',
  'food',
  'government',
  'library',
  'locality',
];
function baselineValues(definition: (typeof definitions)[number]) {
  if (definition.enumName === 'notification_channel_enum')
    return definition.enumValues.filter((value) => value !== 'internal');
  if (definition.enumName === 'file_purpose_enum')
    return definition.enumValues.filter(
      (value) => !['agreement_template', 'stay_agreement', 'staff_agreement'].includes(value),
    );
  if (definition.enumName === 'place_type_enum')
    return definition.enumValues.filter((value) => !laterPlaceCategories.includes(value));
  return definition.enumValues;
}
const baselineDefinitions = definitions.filter((entry) => entry.enumName !== 'property_tier_enum');
const names = baselineDefinitions.map((entry) => entry.enumName).sort();
const snapshotSchema = z.object({
  id: z.string(),
  prevId: z.string(),
  enums: z.record(z.object({ name: z.string(), values: z.array(z.string()) })),
});
function snapshot(index: string) {
  return snapshotSchema.parse(
    JSON.parse(readFileSync(folder + 'meta/' + index + '_snapshot.json', 'utf8')),
  );
}

it('Phase 1 migrations: every pgEnum is exported to the Drizzle schema entry point', () => {
  for (const definition of definitions) expect(Object.values(schema)).toContain(definition);
});

it('Phase 1 migrations: the baseline creates every enum before its first table', () => {
  const created = [...sql.matchAll(/CREATE TYPE "public"\."([^"]+)" AS ENUM/g)];
  expect(created.map((match) => match[1]).sort()).toEqual(names);
  for (const match of created) expect(match.index).toBeLessThan(sql.indexOf('CREATE TABLE'));
  for (const definition of baselineDefinitions) {
    const values = baselineValues(definition)
      .map((value) => "'" + value + "'")
      .join(', ');
    expect(sql).toContain(
      'CREATE TYPE "public"."' + definition.enumName + '" AS ENUM(' + values + ');',
    );
  }
});

it('Phase 1 migrations: generated snapshots preserve enums and the sequential history', () => {
  const zero = snapshot('0000');
  const baseline = snapshot('0001');
  const guards = snapshot('0002');
  expect(baseline.prevId).toBe(zero.id);
  expect(guards.prevId).toBe(baseline.id);
  expect(
    Object.keys(baseline.enums)
      .map((name) => name.replace('public.', ''))
      .sort(),
  ).toEqual(names);
  expect(guards.enums).toEqual(baseline.enums);
  for (const definition of baselineDefinitions) {
    expect(baseline.enums['public.' + definition.enumName]?.values).toEqual(
      baselineValues(definition),
    );
  }
});

it('Phase 1 migrations: PostGIS geography modifiers are outside the quoted type identifier', () => {
  expect(sql).not.toContain('"geography(Point,4326)"');
  expect(sql.match(/geography\(Point,4326\)/g)).toHaveLength(3);
});

it('NTF-002: additive delivery leases preserve baseline history and reject partial leases', () => {
  const guards = snapshot('0002');
  const leases = snapshot('0003');
  expect(leases.prevId).toBe(guards.id);
  expect(leases.enums).toEqual(guards.enums);
  const migration = readFileSync(folder + '0003_petite_forgotten_one.sql', 'utf8');
  expect(migration).toContain('ADD COLUMN "lease_token" uuid');
  expect(migration).toContain('ADD COLUMN "lease_expires_at" timestamp with time zone');
  expect(migration).toContain('ADD CONSTRAINT "outbox_lease_pair_check"');
  expect(migration).not.toMatch(/DROP|DELETE|TRUNCATE/);
});

it('SEC-003: internal jobs extend the channel enum without rewriting baseline migrations', () => {
  const previous = snapshot('0003');
  const current = snapshot('0004');
  expect(current.prevId).toBe(previous.id);
  for (const definition of baselineDefinitions) {
    const key = 'public.' + definition.enumName;
    expect(current.enums[key]?.values).toEqual(
      definition.enumName === 'notification_channel_enum'
        ? definition.enumValues
        : baselineValues(definition),
    );
    if (definition.enumName !== 'notification_channel_enum') {
      expect(current.enums[key]).toEqual(previous.enums[key]);
    }
  }
  expect(current.enums['public.notification_channel_enum']?.values).toEqual([
    ...z.array(z.string()).parse(previous.enums['public.notification_channel_enum']?.values),
    'internal',
  ]);
  // eslint-disable-next-line no-secrets/no-secrets -- Generated migration filename, not a credential.
  const migration = readFileSync(folder + '0004_wonderful_lady_deathstrike.sql', 'utf8');
  expect(migration.trim()).toBe(
    'ALTER TYPE "public"."notification_channel_enum" ADD VALUE \'internal\';',
  );
  expect(migration).not.toMatch(/DROP|DELETE|TRUNCATE/);
});

it('OWN-001 CHG-006: draft migration continues verified history without replacing existing state enums', () => {
  const previous = snapshot('0005'),
    current = snapshot('0006');
  expect(current.prevId).toBe(previous.id);
  expect(current.enums).toEqual(previous.enums);
});

it('OWN-001 CHG-018: property tiers are additive in migration0060 and preserve earlier enums', () => {
  const previous = snapshot('0059'),
    current = snapshot('0060');
  expect(current.prevId).toBe(previous.id);
  expect(previous.enums['public.property_tier_enum']).toBeUndefined();
  expect(current.enums['public.property_tier_enum']?.values).toEqual(enums.propertyTier.enumValues);
  for (const [name, definition] of Object.entries(previous.enums))
    expect(current.enums[name]).toEqual(definition);
  expect(readFileSync(folder + '0060_owner_setup_metadata.sql', 'utf8')).toContain(
    'CREATE TYPE "public"."property_tier_enum"',
  );
});

it('STAY-002: additive agreement file purposes and immutable evidence preserve the baseline', () => {
  const current = snapshot('0068'),
    previous = snapshot('0067');
  expect(current.prevId).toBe(previous.id);
  expect(current.enums['public.file_purpose_enum']?.values).toEqual(
    enums.filePurpose.enumValues.filter((value) => value !== 'staff_agreement'),
  );
  for (const [name, definition] of Object.entries(previous.enums))
    if (name !== 'public.file_purpose_enum') expect(current.enums[name]).toEqual(definition);
  const additive = readFileSync(folder + '0068_sad_bug.sql', 'utf8');
  expect(additive).toContain("ADD VALUE 'agreement_template'");
  expect(additive).toContain("ADD VALUE 'stay_agreement'");
  expect(additive).toContain('stay_agreement_file_once_uq');
  expect(additive).toContain('REFERENCES "public"."stay_agreements"');
  const guard = readFileSync(folder + '0069_agreement_file_guard.sql', 'utf8');
  expect(guard).toContain('BEFORE UPDATE OR DELETE OR TRUNCATE');
  expect(guard).toContain('hsm_reject_audit_mutation');
});

it('0070 and CHG-039: additive migrations bring place types and file purposes to the live schema', () => {
  const beforePlaces = snapshot('0069');
  const afterPlaces = snapshot('0070');
  expect(afterPlaces.prevId).toBe(beforePlaces.id);
  expect(afterPlaces.enums['public.place_type_enum']?.values).toEqual(enums.placeType.enumValues);
  const places = readFileSync(folder + '0070_place_categories.sql', 'utf8');
  for (const value of laterPlaceCategories) {
    expect(places).toContain(`ALTER TYPE "public"."place_type_enum" ADD VALUE '${value}'`);
  }
  const beforeStaff = snapshot('0071');
  const afterStaff = snapshot('0072');
  expect(afterStaff.prevId).toBe(beforeStaff.id);
  expect(afterStaff.enums['public.file_purpose_enum']?.values).toEqual(
    enums.filePurpose.enumValues,
  );
  expect(readFileSync(folder + '0072_staff_and_salaries.sql', 'utf8')).toContain(
    'ALTER TYPE "public"."file_purpose_enum" ADD VALUE \'staff_agreement\'',
  );
});

import { and, eq, sql } from 'drizzle-orm';
import { argon2id, hash } from 'argon2';
import { z } from 'zod';
import type { Database } from './index.js';
import { islamabadAreas, rawalpindiAreas } from './geography-catalog.js';
import {
  adminAccounts,
  amenities,
  areas,
  cities,
  places,
  platformAuditLog,
  users,
} from './schema/index.js';

export const seedEnvironmentSchema = z.object({
  ROOT_ADMIN_EMAIL: z.string().email(),
  ROOT_ADMIN_PASSWORD: z.string().min(12).max(128),
});
export type SeedEnvironment = z.infer<typeof seedEnvironmentSchema>;

export async function seedDatabase(database: Database, input: unknown): Promise<void> {
  const environment = seedEnvironmentSchema.parse(input);
  const passwordHash = await hash(environment.ROOT_ADMIN_PASSWORD, {
    type: argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
  await database.transaction(async (transaction) => {
    // eslint-disable-next-line no-secrets/no-secrets -- Public PostgreSQL function and fixed coordination ID, not a secret.
    await transaction.execute(sql`select pg_advisory_xact_lock(481001)`);
    await seedGeography(transaction);
    await transaction
      .insert(amenities)
      .values([
        { code: 'wifi', name: 'Wi-Fi', isActive: true },
        { code: 'mess', name: 'Mess', isActive: true },
        { code: 'parking', name: 'Parking', isActive: true },
        { code: 'attached_bath', name: 'Attached bathroom', isActive: true },
        { code: 'air_conditioning', name: 'Air conditioning', isActive: true },
        { code: 'security', name: 'Security', isActive: true },
        { code: 'backup_power', name: 'Backup power', isActive: true },
      ])
      .onConflictDoNothing();
    const roots = await transaction
      .select()
      .from(adminAccounts)
      .where(and(eq(adminAccounts.isRoot, true), eq(adminAccounts.status, 'active')));
    const existing = await transaction
      .select()
      .from(users)
      .where(eq(users.email, environment.ROOT_ADMIN_EMAIL))
      .limit(1);
    if (existing[0] && roots.some((root) => root.userId === existing[0]?.id)) return;
    if (roots.length > 0 || existing.length > 0) {
      throw new Error(
        'Root bootstrap is restricted to a new identity on an unprovisioned platform',
      );
    }
    const [user] = await transaction
      .insert(users)
      .values({
        fullName: 'Root Administrator',
        email: environment.ROOT_ADMIN_EMAIL,
        emailVerifiedAt: new Date(),
        passwordHash,
        accountStatus: 'active',
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Root bootstrap failed');
    await transaction
      .insert(adminAccounts)
      .values({ userId: user.id, isRoot: true, status: 'active' });
    // ADM-002, ACC-006: bootstrap grants are authenticated and audited atomically.
    await transaction.insert(platformAuditLog).values({
      actorUserId: null,
      actorRole: 'system',
      action: 'admin.bootstrap',
      targetType: 'user',
      targetId: user.id,
      after: { isRoot: true },
    });
  });
}

export async function seedGeography(
  transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
) {
  await transaction
    .insert(cities)
    .values([
      { name: 'Islamabad', slug: 'islamabad', sortOrder: 1 },
      { name: 'Rawalpindi', slug: 'rawalpindi', sortOrder: 2 },
    ])
    .onConflictDoNothing();
  const [islamabad] = await transaction.select().from(cities).where(eq(cities.slug, 'islamabad'));
  const [rawalpindi] = await transaction.select().from(cities).where(eq(cities.slug, 'rawalpindi'));
  if (!islamabad || !rawalpindi) throw new Error('Reference city seed failed');
  // Insert-only: existing area IDs and branch assignments are never rewritten.
  await transaction
    .insert(areas)
    .values([
      ...islamabadAreas.map((row) => ({ cityId: islamabad.id, ...row })),
      ...rawalpindiAreas.map((row) => ({ cityId: rawalpindi.id, ...row })),
    ])
    .onConflictDoNothing();
  await transaction
    .insert(places)
    .values({
      type: 'university',
      name: 'National University of Sciences and Technology',
      shortName: 'NUST',
      slug: 'nust-islamabad',
      cityId: islamabad.id,
      // Development reference only; verify authoritative coordinates before public use.
      location: 'SRID=4326;POINT(72.9908 33.6426)',
    })
    .onConflictDoNothing();
}

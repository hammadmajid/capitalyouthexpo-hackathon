import { resolveBedDeposit } from '../inventory/bed-deposit.js';
import { roomCapacity } from '../inventory/room-capacity.js';
import { automaticallyAllocate } from './allocation.js';
import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { lockInventoryBranch, rooms, roomTypes, seats, bookingPolicies } from '@hsm/db';
import {
  DomainError,
  resolveBookingPolicy,
  bookingQuoteSnapshotSchema,
  money,
  moneyToJson,
  type QuoteInput,
} from '@hsm/contracts';
import { listRoutes } from '../services/transport-route-data.js';
import type { Transaction } from '../audit/writer.js';
import { publicBranch } from './projection.js';
import { requireStayPolicy } from './policy.js';
import { effectivePrice } from '../inventory/effective-price.js';
import { latestBedPrice } from '../inventory/bed-price.js';
import { publishedBedPhoto, publishedRoomPhoto } from '../marketplace/selectable-media.js';
export async function lockPublicInventory(
  database: Transaction,
  branchId: string,
  input: QuoteInput,
) {
  if (!(await publicBranch(database, branchId)))
    throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
  const locked = await lockInventoryBranch(database, branchId);
  if (
    locked.branch.verificationStatus !== 'approved' ||
    locked.branch.listingHiddenAt ||
    locked.branch.archivedAt ||
    locked.brand.archivedAt ||
    locked.organization.archivedAt ||
    !(await publicBranch(database, branchId, true))
  )
    throw new DomainError('NOT_FOUND', 404, 'Listing unavailable');
  const branch = {
    id: locked.branch.id,
    organizationId: locked.organization.id,
    brandId: locked.brand.id,
    name: locked.branch.name,
    brandName: locked.brand.name,
    category: locked.branch.category,
  };
  const [room] = await database
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.id, input.target.roomId),
        eq(rooms.branchId, branchId),
        eq(rooms.status, 'active'),
        gt(roomCapacity(database, branchId, rooms.id), 0),
        isNull(rooms.archivedAt),
        // ROOM-003 / SEAT-002: unphotographed inventory is internal only.
        publishedRoomPhoto(database, branchId, rooms.id),
      ),
    )
    .for('update');
  if (!room) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  const [type] = await database
    .select()
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, room.roomTypeId),
        eq(roomTypes.branchId, branchId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .for('update');
  if (
    !type ||
    (input.target.kind === 'bed' && type.inventoryMode === 'whole_room') ||
    (input.target.kind === 'room' && type.inventoryMode === 'per_bed')
  )
    throw new DomainError('CONFLICT', 409, 'Inventory mode unavailable');
  let seat: typeof seats.$inferSelect | undefined;
  if (input.target.kind === 'bed') {
    [seat] = await database
      .select()
      .from(seats)
      .where(
        and(
          eq(seats.id, input.target.bedId),
          eq(seats.roomId, room.id),
          eq(seats.branchId, branchId),
          eq(seats.status, 'active'),
          isNull(seats.archivedAt),
          publishedBedPhoto(database, branchId, room.id, seats.id),
        ),
      )
      .for('update');
    if (!seat) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
  } else {
    const unavailable = await database
      .select({ id: seats.id })
      .from(seats)
      .where(
        and(
          eq(seats.roomId, room.id),
          isNull(seats.archivedAt),
          or(eq(seats.status, 'inactive'), eq(seats.status, 'maintenance')),
        ),
      )
      .limit(1);
    if (unavailable.length)
      throw new DomainError('CONFLICT', 409, 'Room contains unavailable inventory');
  }
  return { branch, room, type, seat };
}
export async function resolvedInventoryPolicy(
  database: Transaction,
  branchId: string,
  brandId: string,
  roomTypeId: string,
) {
  const versions = await database
    .select()
    .from(bookingPolicies)
    .where(
      and(
        eq(bookingPolicies.isCurrent, true),
        or(
          and(isNull(bookingPolicies.brandId), isNull(bookingPolicies.branchId)),
          eq(bookingPolicies.brandId, brandId),
          eq(bookingPolicies.branchId, branchId),
        ),
      ),
    )
    .orderBy(bookingPolicies.id);
  const platform = versions.find((value) => value.brandId === null && value.branchId === null);
  if (!platform)
    throw new DomainError('CONFLICT', 409, 'Platform booking policy must be configured');
  const hostel = versions.find((value) => value.brandId === brandId);
  const branch = versions.find((value) => value.branchId === branchId && value.roomTypeId === null);
  const type = versions.find((value) => value.roomTypeId === roomTypeId);
  const lineage = [platform, hostel, branch, type].filter((value) => value !== undefined);
  return {
    policy: resolveBookingPolicy(
      platform.policy,
      lineage.slice(1).map((value) => value.policy),
      platform.platformLimits,
    ),
    policyVersion: lineage.at(-1)?.id ?? platform.id,
    policyLineage: lineage.map((value) => value.id),
  };
}
export async function currentInventoryQuote(
  database: Transaction,
  branchId: string,
  input: QuoteInput,
  clock: () => Date,
) {
  let inventory = await lockPublicInventory(database, branchId, input);
  const terms = await resolvedInventoryPolicy(
    database,
    branchId,
    inventory.branch.brandId,
    inventory.type.id,
  );
  let target = input.target;
  if (!terms.policy.customerSelectsInventory) {
    const allocated = await automaticallyAllocate(
      database,
      branchId,
      inventory.type.id,
      input,
      clock(),
    );
    inventory = { ...inventory, room: allocated.room, seat: allocated.seat };
    target = allocated.target;
  }
  const now = clock();
  const price = await effectivePrice(database, inventory.type, now);
  const bedPrice =
    target.kind === 'bed' && inventory.seat
      ? await latestBedPrice(database, branchId, inventory.seat.id, now)
      : undefined;
  const rent =
    target.kind === 'bed'
      ? (bedPrice?.monthlyRentPaisa ?? price.bedMonthlyRentPaisa)
      : price.roomMonthlyRentPaisa;
  if (rent === null) throw new DomainError('CONFLICT', 409, 'Price unavailable');
  const deposit =
    target.kind === 'bed' && inventory.seat
      ? await resolveBedDeposit(database, branchId, inventory.seat.id, price.depositPaisa, now)
      : price.depositPaisa;
  const availableTransport = await listRoutes(database, branchId, {
    activeOnly: true,
    completeOnly: true,
  });
  const includedTransport =
    availableTransport.offer?.mode === 'included'
      ? availableTransport.data.map(({ id, name }) => ({ id, name }))
      : [];
  const offer = availableTransport.offer;
  const anchor = availableTransport.data[0];
  if (input.transportRequested && offer?.mode !== 'separate' && offer?.mode !== 'included')
    throw new DomainError('CONFLICT', 409, 'Transport is unavailable');
  const quote = bookingQuoteSnapshotSchema.parse({
    version: 1,
    listing: {
      hostelName: inventory.branch.brandName,
      branchName: inventory.branch.name,
      roomTypeName: inventory.type.name,
      roomLabel: inventory.room.label,
      bedLabel: inventory.seat?.label ?? null,
    },
    currency: 'PKR',
    range: input.range,
    target,
    ...terms,
    quotedAt: now.toISOString(),
    ...(input.transportRequested ? { transportRequested: true } : {}),
    ...(offer?.mode === 'separate' && anchor
      ? {
          transportOffer: {
            routeId: anchor.id,
            name: anchor.name,
            monthlyChargePaisa: offer.monthlyChargePaisa,
          },
        }
      : {}),
    ...(includedTransport.length ? { includedTransport } : {}),
    price: {
      monthlyRentPaisa: moneyToJson(money(rent)),
      depositPaisa: moneyToJson(money(deposit)),
      fees: price.fees,
    },
  });
  requireStayPolicy(quote, now);
  return { inventory, quote };
}

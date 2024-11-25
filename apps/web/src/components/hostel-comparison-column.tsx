'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  listPublicInventoryRoomTypes,
  marketplacePrice,
  type HostelComparison,
  type ComparisonInput,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { MarketplaceButton } from './ui/marketplace-button';
export function ComparisonColumn({
  item,
  range,
}: {
  item: HostelComparison[number];
  range: ComparisonInput['range'];
}) {
  const { listing } = item,
    [cursor, setCursor] = useState<string>();
  const types = useQuery({
    queryKey: ['comparison-types', listing.branchId, range, cursor],
    initialData: cursor ? undefined : item.roomTypes,
    retry: false,
    queryFn: () =>
      listPublicInventoryRoomTypes(browserClient(), listing.branchId, {
        limit: 20,
        ...range,
        ...(cursor ? { cursor } : {}),
      }),
  });
  if (types.isError)
    return (
      <article className="min-w-64 space-y-3 p-4">
        <p role="alert">{errorMessage(types.error)}</p>
        <MarketplaceButton disabled={types.isFetching} onClick={() => void types.refetch()}>
          Retry comparison room types
        </MarketplaceButton>
      </article>
    );
  return (
    <article className="min-w-64 max-w-sm flex-1 space-y-3 rounded-panel border border-hsm-border bg-hsm-surface p-4">
      <h3 className="text-lg font-semibold">{listing.name}</h3>
      <p>Verified · {listing.category.replaceAll('_', ' ')}</p>
      <p>{[listing.area, listing.city].filter(Boolean).join(', ')}</p>
      <p>
        Monthly rent from:{' '}
        {listing.priceFromPaisa === null ? 'Unavailable' : marketplacePrice(listing.priceFromPaisa)}
      </p>
      <p>
        Available beds:{' '}
        {listing.availableBeds === null ? 'Choose stay dates' : listing.availableBeds}
      </p>
      <p>
        Available whole rooms:{' '}
        {listing.availableWholeRooms === null ? 'Choose stay dates' : listing.availableWholeRooms}
      </p>
      <p>
        Distance:{' '}
        {listing.distanceMeters === null
          ? 'No destination selected'
          : Math.round(listing.distanceMeters) + ' m'}
      </p>
      <p>
        Amenities: {listing.amenities.map((amenity) => amenity.name).join(', ') || 'Not published'}
      </p>
      <p>
        Mess/menu: not available. Transport: not available. Verified reviews/rating: not available.
      </p>
      <h4 className="font-semibold">Room types and deposits</h4>
      {types.isFetching ? (
        <p role="status">Refreshing room prices…</p>
      ) : (
        <ul className="space-y-3">
          {types.data?.data.map((type) => (
            <li key={type.id}>
              <p>
                {type.name} · Capacity {type.capacity}
              </p>
              <p>
                Bed/month:{' '}
                {type.bedMonthlyRentPaisa === null
                  ? 'Not offered'
                  : marketplacePrice(type.bedMonthlyRentPaisa)}
              </p>
              <p>
                Room/month:{' '}
                {type.roomMonthlyRentPaisa === null
                  ? 'Not offered'
                  : marketplacePrice(type.roomMonthlyRentPaisa)}
              </p>
              <p>Deposit: {marketplacePrice(type.depositPaisa)}</p>
              <p>{type.amenities.map((amenity) => amenity.name).join(', ')}</p>
            </li>
          ))}
        </ul>
      )}
      {!types.isFetching && !types.isError && types.data?.data.length === 0 ? (
        <p>No published room types on this page.</p>
      ) : null}
      {types.data?.nextCursor && !types.isError ? (
        <MarketplaceButton
          disabled={types.isFetching}
          variant="secondary"
          onClick={() => setCursor(types.data?.nextCursor ?? undefined)}
        >
          Next room types for {listing.name}
        </MarketplaceButton>
      ) : null}
      {cursor ? (
        <MarketplaceButton
          disabled={types.isFetching}
          variant="ghost"
          onClick={() => setCursor(undefined)}
        >
          First room types for {listing.name}
        </MarketplaceButton>
      ) : null}
      <Link href={'/hostels/' + listing.branchId}>View {listing.name}</Link>
    </article>
  );
}

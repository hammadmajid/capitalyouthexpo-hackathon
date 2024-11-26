'use client';
import { useState } from 'react';
import { useInfiniteQuery, useMutation } from '@tanstack/react-query';
import {
  readVerificationEvidence,
  readVerificationPhotos,
  readVerificationPricing,
} from '@hsm/api-client';
import { formatMoney, money } from '@hsm/contracts';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { OperationState, type useOperationScope } from './admin-operations';
type Scope = ReturnType<typeof useOperationScope>;
const price = (value: string | null) =>
  value === null ? 'Not set' : formatMoney(money(BigInt(value)));
export function VerificationResources({ branchId, scope }: { branchId: string; scope: Scope }) {
  const pricing = useInfiniteQuery({
    queryKey: [...scope.key, 'pricing', branchId],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readVerificationPricing(c, branchId, {
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const photos = useInfiniteQuery({
    queryKey: [...scope.key, 'photos', branchId],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      scope.read(
        (c) =>
          readVerificationPhotos(c, branchId, {
            limit: 20,
            ...(pageParam ? { cursor: pageParam } : {}),
          }),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [purpose, setPurpose] = useState('');
  const access = useMutation({
    gcTime: 0,
    retry: false,
    mutationFn: (fileId: string) =>
      scope.read((c) =>
        readVerificationEvidence(c, branchId, fileId, { justification: purpose.trim() }),
      ),
  });
  return (
    <div className="space-y-4">
      <h4 className="font-semibold">Pricing and deposits</h4>
      <OperationState
        pending={pricing.isPending}
        error={pricing.error}
        retry={() => void pricing.refetch()}
        empty={!pricing.data?.pages.some((page) => page.data.length)}
      />
      {!pricing.isError ? (
        <ul>
          {pricing.data?.pages
            .flatMap((page) => page.data)
            .map((row) => (
              <li key={row.id}>
                {row.name} · Capacity {row.capacity} · Bed monthly {price(row.bedMonthlyRentPaisa)}{' '}
                · Room monthly {price(row.roomMonthlyRentPaisa)} · Deposit {price(row.depositPaisa)}
              </li>
            ))}
        </ul>
      ) : null}
      {!pricing.isError && pricing.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={pricing.isFetching}
          onClick={() => void pricing.fetchNextPage()}
        >
          Load more verification pricing
        </Button>
      ) : null}
      <h4 className="font-semibold">Submitted property photos</h4>
      <OperationState
        pending={photos.isPending}
        error={photos.error}
        retry={() => void photos.refetch()}
        empty={!photos.data?.pages.some((page) => page.data.length)}
      />
      <label>
        Photo access purpose
        <textarea
          aria-label="Photo access purpose"
          className="field-input"
          value={purpose}
          maxLength={500}
          disabled={access.isPending}
          onChange={(e) => {
            access.reset();
            setPurpose(e.target.value);
          }}
        />
      </label>
      {!photos.isError
        ? photos.data?.pages
            .flatMap((page) => page.data)
            .map((row) => (
              <div key={row.id}>
                <p>
                  {row.altText} ·{' '}
                  {row.seatId ? 'Seat photo' : row.roomId ? 'Room photo' : 'Hostel photo'} ·{' '}
                  {row.available ? 'Available' : 'Unavailable'}
                </p>
                <Button
                  variant="secondary"
                  disabled={!row.available || purpose.trim().length < 8 || access.isPending}
                  onClick={() => access.mutate(row.fileId)}
                >
                  Access property photo: {row.altText}
                </Button>
              </div>
            ))
        : null}
      {!photos.isError && photos.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={photos.isFetching}
          onClick={() => void photos.fetchNextPage()}
        >
          Load more verification photos
        </Button>
      ) : null}
      {access.isError ? <p role="alert">{errorMessage(access.error)}</p> : null}
      {access.data ? (
        <a className="text-link" href={access.data.url} target="_blank" rel="noreferrer">
          Open authorized property photo (expires {access.data.expiresAt})
        </a>
      ) : null}
    </div>
  );
}

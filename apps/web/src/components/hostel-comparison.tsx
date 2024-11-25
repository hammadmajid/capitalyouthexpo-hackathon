'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { comparisonInputSchema, readHostelComparison, type ComparisonInput } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { MarketplaceButton } from './ui/marketplace-button';
import { ComparisonColumn } from './hostel-comparison-column';
type Candidate = { branchId: string; name: string };
export function HostelComparison({
  listings,
  institutions,
  unavailable = false,
}: {
  listings: Candidate[];
  institutions: { id: string; name: string }[];
  unavailable?: boolean;
}) {
  const [selected, setSelected] = useState<Candidate[]>([]),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [input, setInput] = useState<ComparisonInput>();
  const [destination, setDestination] = useState('');
  const comparison = useQuery({
    queryKey: ['hostel-comparison', input],
    enabled: Boolean(input),
    retry: false,
    queryFn: () => {
      if (!input) throw new Error('Choose hostels');
      return readHostelComparison(browserClient(), input);
    },
  });
  const parsed = comparisonInputSchema.safeParse({
    ids: selected.map((row) => row.branchId),
    ...(destination ? { destinationId: destination } : {}),
    ...(from || to ? { range: { moveInDate: from, moveOutDate: to } } : {}),
  });
  function toggle(listing: Candidate) {
    setInput(undefined);
    setSelected((current) =>
      current.some((row) => row.branchId === listing.branchId)
        ? current.filter((row) => row.branchId !== listing.branchId)
        : current.length < 4
          ? [...current, listing]
          : current,
    );
  }
  return (
    <section className="space-y-4" aria-label="Compare hostels">
      <h2 className="text-xl font-semibold">Compare hostels</h2>
      <p>Choose two to four hostels. Add stay dates to compare current availability.</p>
      {unavailable ? (
        <p role="status">Refresh current listings before changing your comparison.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {listings.map((listing) => (
            <MarketplaceButton
              key={listing.branchId}
              variant="secondary"
              disabled={
                selected.length === 4 && !selected.some((row) => row.branchId === listing.branchId)
              }
              aria-pressed={selected.some((row) => row.branchId === listing.branchId)}
              onClick={() => toggle(listing)}
            >
              Compare {listing.name}
            </MarketplaceButton>
          ))}
        </div>
      )}
      <label className="field-label">
        Comparison destination
        <select
          className="field-input"
          value={destination}
          onChange={(event) => {
            setDestination(event.target.value);
            setInput(undefined);
          }}
        >
          <option value="">No destination</option>
          {institutions.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        Distances are straight-line distances to the selected approved destination, not travel
        routes.
      </p>
      <ul>
        {selected.map((listing) => (
          <li key={listing.branchId}>
            {listing.name}{' '}
            <MarketplaceButton variant="ghost" onClick={() => toggle(listing)}>
              Remove {listing.name}
            </MarketplaceButton>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-3">
        <label className="field-label">
          Comparison move-in
          <input
            className="field-input"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setInput(undefined);
            }}
          />
        </label>
        <label className="field-label">
          Comparison move-out
          <input
            className="field-input"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setInput(undefined);
            }}
          />
        </label>
      </div>
      <MarketplaceButton
        disabled={!parsed.success || unavailable || comparison.isFetching}
        onClick={() => {
          if (parsed.success) {
            if (JSON.stringify(input) === JSON.stringify(parsed.data)) void comparison.refetch();
            else setInput(parsed.data);
          }
        }}
      >
        Load current comparison
      </MarketplaceButton>
      {input && comparison.isFetching ? <p role="status">Checking current listings…</p> : null}
      {input && comparison.error ? (
        <p role="alert">
          {errorMessage(comparison.error)} Refresh the comparison or remove unavailable hostels.
        </p>
      ) : null}
      {input && comparison.data && !comparison.isFetching && !comparison.isError ? (
        <div className="flex gap-4 overflow-x-auto" aria-label="Current hostel comparison">
          {comparison.data.map((item) => (
            <ComparisonColumn
              key={JSON.stringify([item.listing.branchId, input.range])}
              item={item}
              range={input.range}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

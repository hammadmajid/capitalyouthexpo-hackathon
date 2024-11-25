import { Search, SlidersHorizontal } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { MarketplaceQuery } from '@hsm/contracts';
import { marketplaceSearch, emptyMarketplaceSearch } from '../lib/marketplace-search';
import { inventoryRupees } from '../lib/inventory-money';
import { MarketplaceButton as Button } from './ui/marketplace-button';
export function MarketplaceSearchForm({
  initial,
  onApply,
}: {
  initial: Partial<MarketplaceQuery>;
  onApply: (query: Partial<MarketplaceQuery>) => void;
}) {
  const [fields, setFields] = useState<typeof emptyMarketplaceSearch>({
    ...emptyMarketplaceSearch,
    q: initial.q ?? '',
    category: initial.category ?? '',
    minimum:
      initial.minimumRentPaisa === undefined ? '' : inventoryRupees(initial.minimumRentPaisa),
    maximum:
      initial.maximumRentPaisa === undefined ? '' : inventoryRupees(initial.maximumRentPaisa),
    moveIn: initial.moveInDate ?? '',
    moveOut: initial.moveOutDate ?? '',
    available: initial.availableOnly ?? false,
    deposit:
      initial.maximumDepositPaisa === undefined ? '' : inventoryRupees(initial.maximumDepositPaisa),
    capacity: initial.capacity === undefined ? '' : String(initial.capacity),
    optionKind: initial.optionKind ?? '',
    sort: initial.sort ?? '',
  });
  const [invalid, setInvalid] = useState(false);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const institution =
        initial.universityPlaceId && initial.radiusMeters !== undefined
          ? { universityPlaceId: initial.universityPlaceId, radiusMeters: initial.radiusMeters }
          : undefined;
      onApply(marketplaceSearch(fields, institution));
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  return (
    <form
      aria-label="Search hostels"
      onSubmit={submit}
      className="customer-frost grid gap-3 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="field-label mb-0 min-w-40 flex-1">
          Hostel, university or area
          <input
            className="field-input"
            type="search"
            maxLength={120}
            value={fields.q}
            onChange={(event) => setFields({ ...fields, q: event.target.value })}
          />
        </label>
        <Button type="submit">
          <Search size={18} aria-hidden /> Search
        </Button>
      </div>
      <details open={invalid || undefined}>
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-hsm-primary">
          <SlidersHorizontal size={18} aria-hidden /> Filters
        </summary>
        <div className="grid gap-4 pt-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { key: 'minimum', label: 'Minimum monthly rent (PKR)', type: 'text', max: 17 },
            { key: 'maximum', label: 'Maximum monthly rent (PKR)', type: 'text', max: 17 },
            { key: 'moveIn', label: 'Move-in date', type: 'date', max: 10 },
            { key: 'moveOut', label: 'Move-out date', type: 'date', max: 10 },
            { key: 'deposit', label: 'Maximum security deposit (PKR)', type: 'text', max: 17 },
            { key: 'capacity', label: 'Seater (beds per room)', type: 'text', max: 2 },
          ].map((field) => (
            <label key={field.key} className="field-label">
              {field.label}
              <input
                className="field-input"
                type={field.type}
                maxLength={field.max}
                value={
                  fields[
                    field.key as
                      'minimum' | 'maximum' | 'moveIn' | 'moveOut' | 'deposit' | 'capacity'
                  ]
                }
                onChange={(event) =>
                  setFields((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </label>
          ))}
          <label className="field-label">
            Hostel category
            <select
              className="field-input"
              value={fields.category}
              onChange={(event) =>
                setFields((current) => ({ ...current, category: event.target.value }))
              }
            >
              <option value="">All categories</option>
              <option value="boys">Boys</option>
              <option value="girls">Girls</option>
              <option value="working_male">Working men</option>
              <option value="working_female">Working women</option>
            </select>
          </label>
          <label className="field-label">
            Room option
            <select
              className="field-input"
              value={fields.optionKind}
              onChange={(event) => {
                const optionKind = (['', 'bed', 'room'] as const).find(
                  (value) => value === event.target.value,
                );
                setFields((current) => ({ ...current, optionKind: optionKind ?? '' }));
              }}
            >
              <option value="">Shared beds and whole rooms</option>
              <option value="bed">Shared bed</option>
              <option value="room">Whole room</option>
            </select>
          </label>
          <label className="field-label">
            Sort by
            <select
              className="field-input"
              value={fields.sort}
              onChange={(event) =>
                setFields((current) => ({
                  ...current,
                  sort:
                    (
                      [
                        '',
                        'recommended',
                        'nearest',
                        'price_asc',
                        'price_desc',
                        'most_available',
                      ] as const
                    ).find((value) => value === event.target.value) ?? '',
                }))
              }
            >
              <option value="">Default order</option>
              <option value="recommended">Recommended</option>
              {initial.universityPlaceId ? <option value="nearest">Nearest</option> : null}
              <option value="price_asc">Lowest price</option>
              <option value="price_desc">Highest price</option>
              <option value="most_available">Most available (needs dates)</option>
            </select>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={fields.available}
              onChange={(event) =>
                setFields((current) => ({ ...current, available: event.target.checked }))
              }
            />
            Only available for these dates
          </label>
        </div>
        {invalid ? (
          <p role="alert">
            Check the rent and deposit amounts, seater size and ordered stay dates. Availability and
            Most available require dates.
          </p>
        ) : null}
        <div className="flex gap-3">
          <Button type="submit">Apply filters</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setFields(emptyMarketplaceSearch);
              setInvalid(false);
              onApply({ limit: 20 });
            }}
          >
            Clear filters
          </Button>
        </div>
      </details>
    </form>
  );
}

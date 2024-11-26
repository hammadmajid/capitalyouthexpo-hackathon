'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { marketplaceInstitutions } from '@hsm/api-client';
import {
  transportRouteInputSchema,
  type TransportDestination,
  type TransportRoute,
} from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { Button } from '../ui/button';

export type RouteInput = ReturnType<typeof transportRouteInputSchema.parse>;
type Kind = TransportDestination['kind'];
// The server accepts a catalog place only under its matching kind; anything else is custom.
const kindOf: Record<string, Kind> = {
  university: 'university',
  school: 'university',
  office: 'office',
  business_hub: 'office',
  government: 'office',
  locality: 'area',
};
// CHG-049: just "available at". Search the HSM places list or type a name; the kind follows
// from the place, so the owner never picks a category.
function PlacePicker({
  value,
  onChange,
}: {
  value: TransportDestination[];
  onChange: (rows: TransportDestination[]) => void;
}) {
  const [text, setText] = useState('');
  const typed = text.trim();
  const matches = useQuery({
    queryKey: ['transport-places', typed],
    queryFn: () => marketplaceInstitutions(browserClient(), { q: typed }),
    enabled: typed.length >= 2,
    staleTime: 30000,
  });
  function add(next: TransportDestination) {
    if (value.some((row) => row.name.toLowerCase() === next.name.toLowerCase())) return;
    onChange([...value, next]);
    setText('');
  }
  return (
    <fieldset className="space-y-2">
      <legend>Available at</legend>
      {value.map((row, index) => (
        <div key={index + row.name} className="flex flex-wrap items-center gap-2">
          {row.name}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onChange(value.filter((_, at) => at !== index))}
          >
            Remove {row.name}
          </Button>
        </div>
      ))}
      <input
        aria-label="Search or type a place"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={120}
        placeholder="University, office or area"
        className="field-input"
      />
      {(matches.data?.data ?? []).slice(0, 5).map((place) => {
        const kind = kindOf[place.type];
        return (
          <Button
            key={place.id}
            type="button"
            variant="secondary"
            onClick={() =>
              add(
                kind
                  ? { kind, name: place.name, placeId: place.id, areaId: null }
                  : { kind: 'other', name: place.name, placeId: null, areaId: null },
              )
            }
          >
            {place.name}
          </Button>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        disabled={typed.length < 2}
        onClick={() => add({ kind: 'other', name: typed, placeId: null, areaId: null })}
      >
        Add this place
      </Button>
    </fieldset>
  );
}
// CHG-049: a route is a name and the places it serves. Timings, pick-up points and the
// description are no longer asked; saving clears any old ones so nothing hidden stays on the
// route. A route is offered to residents once it is published and has a place.
export function TransportRouteEditor({
  route,
  busy,
  save,
  close,
}: {
  route?: TransportRoute;
  busy: boolean;
  save: (input: RouteInput) => void;
  close: () => void;
}) {
  const [name, setName] = useState(route?.name ?? '');
  const [places, setPlaces] = useState(route?.destinations ?? []);
  const [problem, setProblem] = useState('');
  function submit(status: 'active' | 'inactive') {
    // An unnamed route is named after its first place.
    const label = name.trim() || places[0]?.name || '';
    if (label.length < 2 || (status === 'active' && !places.length))
      return setProblem('Add a place first.');
    const input = transportRouteInputSchema.safeParse({
      name: label.slice(0, 120),
      status,
      destinations: places,
      stops: [],
      stopPoints: [],
      departureTimes: [],
      trips: [],
    });
    if (!input.success) return setProblem(input.error.issues[0]?.message ?? 'Check route details.');
    setProblem('');
    save(input.data);
  }
  const published = route?.status === 'active';
  return (
    <section
      aria-label={route ? 'Edit route' : 'New route'}
      className="space-y-3 rounded-xl border border-border p-3"
    >
      <h4 className="font-semibold">{route ? 'Edit route' : 'New route'}</h4>
      <fieldset disabled={busy} className="space-y-3">
        <PlacePicker value={places} onChange={setPlaces} />
        <label className="field-label">
          Route name (optional)
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            placeholder={places[0]?.name ?? 'e.g. University route'}
            className="field-input"
          />
        </label>
        {problem ? <p role="alert">{problem}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => submit(route?.status ?? 'active')}>
            {route ? 'Save route' : 'Publish route'}
          </Button>
          {route ? (
            // Private routes stay saved but are not offered to residents.
            <Button
              type="button"
              variant="secondary"
              onClick={() => submit(published ? 'inactive' : 'active')}
            >
              {published ? 'Make private' : 'Publish route'}
            </Button>
          ) : null}
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </fieldset>
    </section>
  );
}

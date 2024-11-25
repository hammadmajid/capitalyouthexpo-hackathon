'use client';
import type { PropertyPages } from './use-property-pages';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
export function PropertyPageControls({
  state,
  disabled,
}: {
  state: PropertyPages;
  disabled: boolean;
}) {
  const { buildings, floors, building } = state;
  const busy = disabled || buildings.isFetching || Boolean(building && floors.isFetching);
  if (buildings.isError)
    return (
      <div>
        <p role="alert">{errorMessage(buildings.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void buildings.refetch()}>
          Retry property access
        </Button>
      </div>
    );
  return (
    <div className="space-y-2">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          state.search();
        }}
        className="flex gap-2"
      >
        <input
          className="field-input"
          aria-label="Search buildings"
          maxLength={80}
          value={state.draft}
          disabled={busy}
          onChange={(event) => state.setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={busy}>
          Search buildings
        </Button>
      </form>
      {!buildings.data ? <p role="status">Loading buildings…</p> : null}
      <label className="field-label">
        Building
        <select
          className="field-input"
          aria-label="Property building"
          value={building?.id ?? ''}
          disabled={busy || !buildings.data}
          onChange={(event) => state.selectBuilding(event.target.value)}
        >
          <option value="">Choose a building</option>
          {buildings.data?.data.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
              {row.archivedAt ? ' (archived)' : ''}
            </option>
          ))}
        </select>
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !state.hasPreviousBuildings}
        onClick={state.firstBuildings}
      >
        First buildings
      </Button>{' '}
      <Button
        type="button"
        variant="secondary"
        disabled={busy || !buildings.data?.nextCursor}
        onClick={state.nextBuildings}
      >
        More buildings
      </Button>
      {building ? (
        floors.isError ? (
          <div>
            <p role="alert">{errorMessage(floors.error)}</p>
            <Button type="button" variant="secondary" onClick={() => void floors.refetch()}>
              Retry floor access
            </Button>
          </div>
        ) : (
          <>
            {!floors.data ? <p role="status">Loading floors…</p> : null}
            <label className="field-label">
              Floor
              <select
                className="field-input"
                aria-label="Property floor"
                value={state.floor?.id ?? ''}
                disabled={busy || !floors.data}
                onChange={(event) => state.selectFloor(event.target.value)}
              >
                <option value="">Choose a floor</option>
                {floors.data?.data.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label} · Level {row.levelNumber}
                    {row.archivedAt ? ' (archived)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !state.hasPreviousFloors}
              onClick={state.firstFloors}
            >
              First floors
            </Button>{' '}
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !floors.data?.nextCursor}
              onClick={state.nextFloors}
            >
              More floors
            </Button>
          </>
        )
      ) : null}
    </div>
  );
}

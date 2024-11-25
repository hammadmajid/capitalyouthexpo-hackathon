'use client';
import { useInventoryNavigationLock } from './inventory-navigation';
import { useState } from 'react';
import { ApiFailure } from '@hsm/api-client';
import type { PrivateListing } from '@hsm/contracts';
import { useListingSettings } from './use-listing-settings';
import { ListingEditor } from './listing-editor';
import { inventoryScopeDenied } from './use-branch-inventory';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { CustomAmenities } from './amenities/custom-amenities';
import { useCustomAmenities } from './amenities/use-custom-amenities';
export function ListingSettings(props: { actorId: string; branchId: string }) {
  return <Settings key={props.actorId + ':' + props.branchId} {...props} />;
}
function Settings({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<PrivateListing>(),
    [saved, setSaved] = useState(false);
  const customCodes = useCustomAmenities(actorId, branchId, open).rows.map((row) => row.code);
  const { query, catalog, mutation } = useListingSettings(actorId, branchId, open, () => {
    setDraft(undefined);
    setSaved(true);
  });
  const denied = [query.error, mutation.error].find(
    (error) =>
      inventoryScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND'),
  );
  useInventoryNavigationLock((open && Boolean(query.data) && !denied) || mutation.isPending);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View listing details
      </Button>
    );
  if (denied)
    return (
      <section aria-label="Listing details">
        <p role="alert">{errorMessage(denied)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(undefined);
            mutation.reset();
            void query.refetch();
          }}
        >
          Retry listing access
        </Button>
      </section>
    );
  if (query.isPending) return <p role="status">Loading listing details…</p>;
  const current = query.data;
  if (!current)
    return (
      <section aria-label="Listing details">
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry listing details
        </Button>
      </section>
    );
  const conflict = Boolean(
    draft &&
    (draft.version !== current.version ||
      (mutation.error instanceof ApiFailure && mutation.error.code === 'PRECONDITION_FAILED')),
  );
  const unavailable = Boolean(query.error) || query.isFetching || mutation.isPending;
  const amenities = catalog.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <section aria-label="Listing details" className="space-y-4">
      <h2 className="text-xl font-semibold">Listing details</h2>
      {saved ? <p role="status">Listing details saved.</p> : null}
      {query.error ? (
        <p role="alert">
          Listing access could not refresh. Your entered changes are retained; retry before saving.
        </p>
      ) : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {conflict ? (
        <div className="space-y-2">
          <p role="alert">
            This listing changed. Your entered changes are retained. Reload current values to
            replace your draft before saving.
          </p>
          <Button
            variant="secondary"
            disabled={unavailable}
            onClick={() => {
              setDraft(current);
              mutation.reset();
            }}
          >
            Reload current listing values
          </Button>
        </div>
      ) : null}
      {!current.canEdit ? (
        <p>Your current role can view this listing. Editing requires a listing grant.</p>
      ) : null}
      {draft && current.canEdit ? (
        <ListingEditor
          key={draft.version}
          initial={draft}
          catalog={amenities}
          disabled={unavailable || conflict}
          customCodes={customCodes}
          custom={(codes, change) => (
            <CustomAmenities
              actorId={actorId}
              branchId={branchId}
              selected={codes}
              change={unavailable || conflict ? undefined : change}
            />
          )}
          onSave={(input) => mutation.mutate({ version: draft.version, input })}
          onCancel={() => {
            if (!mutation.isPending) {
              setDraft(undefined);
              mutation.reset();
            }
          }}
        />
      ) : (
        <>
          <p>{current.description ?? 'No description has been saved.'}</p>
          <p>Nearby landmark: {current.nearbyLandmark ?? 'Not provided'}</p>
          <p>Public contact visibility: {current.showPublicContact ? 'Shown' : 'Hidden'}</p>
          <p>Contact phone: {current.publicPhone ?? 'Not provided'}</p>
          <p>Contact email: {current.publicEmail ?? 'Not provided'}</p>
          <ul>
            {current.amenities.map((entry) => (
              <li key={entry.code}>
                {entry.name}
                {entry.isActive ? '' : ' — Retired'}
              </li>
            ))}
          </ul>
          {current.canEdit ? (
            <Button
              disabled={unavailable}
              onClick={() => {
                setDraft(current);
                setSaved(false);
                mutation.reset();
              }}
            >
              Edit listing details
            </Button>
          ) : null}
        </>
      )}
      {catalog.error ? (
        <p role="alert">
          Approved amenities could not load. Previously selected amenities are retained.
        </p>
      ) : null}
      {catalog.error ? (
        <Button
          variant="secondary"
          disabled={catalog.isFetching}
          onClick={() => void catalog.refetch()}
        >
          Retry approved amenities
        </Button>
      ) : null}
      {catalog.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={catalog.isFetching}
          onClick={() => void catalog.fetchNextPage()}
        >
          Load more approved amenities
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={mutation.isPending || query.isFetching}
        onClick={() => void query.refetch()}
      >
        Refresh listing access
      </Button>
      <Button
        variant="secondary"
        disabled={mutation.isPending}
        onClick={() => {
          setOpen(false);
          setDraft(undefined);
          setSaved(false);
          mutation.reset();
        }}
      >
        Close listing details
      </Button>
    </section>
  );
}

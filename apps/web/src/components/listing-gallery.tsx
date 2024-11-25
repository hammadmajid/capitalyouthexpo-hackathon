'use client';
import { useInventoryNavigationLock } from './inventory-navigation';
import { useState } from 'react';
import { ApiFailure } from '@hsm/api-client';
import type { GalleryQuery, GalleryTarget } from '@hsm/contracts';
import { useListingGallery } from './use-listing-gallery';
import { GalleryEditor, type GalleryEditorState } from './gallery-editor';
import { GalleryImageCard } from './gallery-image-card';
import { inventoryScopeDenied } from './use-branch-inventory';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
type GalleryProps = {
  actorId: string;
  branchId: string;
  // ROOM-002/003: an inventory target scopes the gallery to one room or bed.
  target?: GalleryTarget;
  title?: string;
};
export function ListingGallery(props: GalleryProps) {
  const scope = props.target
    ? props.target.roomId + (props.target.kind === 'bed' ? ':' + props.target.bedId : '')
    : '';
  return <Gallery key={props.actorId + ':' + props.branchId + ':' + scope} {...props} />;
}
function Gallery({ actorId, branchId, target, title = 'Listing gallery' }: GalleryProps) {
  const [open, setOpen] = useState(false),
    [state, setState] = useState<GalleryQuery['state']>('active'),
    [draft, setDraft] = useState<GalleryEditorState>(),
    [saved, setSaved] = useState(false);
  const { query, mutation, clearKeys } = useListingGallery(
    actorId,
    branchId,
    state,
    open,
    () => {
      setDraft(undefined);
      setSaved(true);
    },
    target,
  );
  function cancel() {
    if (!mutation.isPending) {
      setDraft(undefined);
      mutation.reset();
      clearKeys();
    }
  }
  const denied = [query.error, mutation.error].find(inventoryScopeDenied);
  useInventoryNavigationLock((open && Boolean(query.data) && !denied) || mutation.isPending);
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {'View ' + title.toLowerCase()}
      </Button>
    );
  if (denied)
    return (
      <section aria-label={title}>
        <p role="alert">{errorMessage(denied)}</p>
        <Button
          variant="secondary"
          onClick={() => {
            cancel();
            void query.refetch();
          }}
        >
          Retry gallery access
        </Button>
      </section>
    );
  if (query.isPending) return <p role="status">Loading listing gallery…</p>;
  const pages = query.data?.pages;
  if (!pages)
    return (
      <section aria-label={title}>
        <p role="alert">{errorMessage(query.error)}</p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Retry listing gallery
        </Button>
      </section>
    );
  const images = pages
      .flatMap((page) => page.data)
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder ||
          (left.id < right.id ? -1 : left.id === right.id ? 0 : 1),
      ),
    canEdit = pages.length > 0 && pages.every((page) => page.canEdit),
    canPublish = canEdit && pages.every((page) => page.canPublish),
    unavailable = Boolean(query.error) || query.isFetching || mutation.isPending;
  const selected =
    draft && draft.kind !== 'attach'
      ? images.find((image) => image.id === draft.initial.id)
      : undefined;
  const removed = Boolean(draft && draft.kind !== 'attach' && (!selected || selected.archivedAt));
  const conflict = Boolean(
    draft &&
    draft.kind !== 'attach' &&
    selected &&
    (draft.initial.version !== selected.version ||
      (mutation.error instanceof ApiFailure && mutation.error.code === 'PRECONDITION_FAILED')),
  );
  return (
    <section aria-label={title} className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p>
        Clean photos stay private until you explicitly enable publication. Branch approval and
        current scan eligibility still control public access.
      </p>
      {target ? (
        <p>
          {target.kind === 'bed'
            ? 'This bed is publicly selectable only with a published room photo and its own published bed photo.'
            : 'This room is publicly selectable only with at least one published room photo.'}
        </p>
      ) : null}
      <label>
        Image history
        <select
          className="field-input"
          value={state}
          disabled={Boolean(draft) || mutation.isPending}
          onChange={(event) => {
            const next = event.target.value;
            if (next === 'active' || next === 'archived' || next === 'all') {
              setState(next);
              setSaved(false);
              mutation.reset();
            }
          }}
        >
          <option value="active">Active images</option>
          <option value="archived">Archived images</option>
          <option value="all">All images</option>
        </select>
      </label>
      {saved ? <p role="status">Image action saved. Refreshing actual gallery state.</p> : null}
      {query.error ? (
        <p role="alert">
          Gallery could not refresh. Your entered changes are retained; retry before saving.
        </p>
      ) : null}
      {mutation.error ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {!canEdit ? <p>You can view gallery metadata. Editing requires a listing grant.</p> : null}
      {canEdit && !canPublish ? (
        <p>Changing published images or choosing covers requires a publication grant.</p>
      ) : null}
      {removed ? (
        <p role="alert">
          This image is no longer available for the selected action. Close this action to review
          current gallery state.
        </p>
      ) : null}
      {conflict && !removed ? (
        <div className="space-y-2">
          <p role="alert">
            This image changed. Your draft is retained until you explicitly reload current image
            values.
          </p>
          <Button
            variant="secondary"
            disabled={unavailable}
            onClick={() => {
              if (draft && draft.kind !== 'attach' && selected) {
                setDraft({ ...draft, initial: selected });
                mutation.reset();
                clearKeys();
              }
            }}
          >
            Reload current image values
          </Button>
        </div>
      ) : null}
      {draft && canEdit && !removed ? (
        <GalleryEditor
          key={
            draft.kind +
            (draft.kind === 'attach' ? '' : ':' + draft.initial.id + ':' + draft.initial.version)
          }
          state={draft}
          canPublish={canPublish}
          disabled={unavailable || conflict}
          pending={mutation.isPending}
          onSave={(command) => mutation.mutate(command)}
          onCancel={cancel}
        />
      ) : null}
      {removed ? (
        <Button variant="secondary" disabled={mutation.isPending} onClick={cancel}>
          Close unavailable image action
        </Button>
      ) : null}
      {!draft && canEdit && state !== 'archived' ? (
        <Button
          disabled={unavailable}
          onClick={() => {
            setDraft({ kind: 'attach' });
            setSaved(false);
            mutation.reset();
          }}
        >
          Add listing image
        </Button>
      ) : null}
      {!images.length ? <p>No images are saved in this gallery view.</p> : null}
      {images.map((image) => (
        <GalleryImageCard
          key={image.id + ':' + image.version}
          image={image}
          canEdit={canEdit}
          canPublish={canPublish}
          disabled={unavailable || Boolean(draft)}
          onAction={(next) => {
            setDraft(next);
            setSaved(false);
            mutation.reset();
          }}
        />
      ))}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={query.isFetching}
          onClick={() => void query.fetchNextPage()}
        >
          Load more gallery images
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={query.isFetching || mutation.isPending}
        onClick={() => void query.refetch()}
      >
        Refresh gallery access
      </Button>
      <Button
        variant="secondary"
        disabled={mutation.isPending}
        onClick={() => {
          cancel();
          setOpen(false);
          setSaved(false);
        }}
      >
        Close listing gallery
      </Button>
    </section>
  );
}

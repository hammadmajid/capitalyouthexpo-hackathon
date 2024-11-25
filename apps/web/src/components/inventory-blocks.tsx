'use client';
import { useState } from 'react';
import type { InventoryBlockListQuery } from '@hsm/contracts';
import { Button } from './ui/button';
import { errorMessage } from '../lib/messages';
import { inventoryScopeDenied } from './use-branch-inventory';
import { useInventoryBlocks } from './use-inventory-blocks';
import { ReleaseBlockForm } from './inventory-block-form';
import { karachiDateTime } from '../lib/karachi-time';
import { InventoryBlockPagedForm } from './inventory-block-paged-form';
export function InventoryBlocks(props: { actorId: string; branchId: string }) {
  return <Blocks key={props.actorId + ':' + props.branchId} {...props} />;
}
function Blocks({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [state, setState] = useState<InventoryBlockListQuery['state']>('unreleased');
  const [adding, setAdding] = useState(false),
    [releasing, setReleasing] = useState<string>();
  const [notice, setNotice] = useState('');
  const { access, blocks, mutation } = useInventoryBlocks(actorId, branchId, state, (kind) => {
    setAdding(false);
    setReleasing(undefined);
    setNotice(kind === 'create' ? 'Block created.' : 'Block released.');
    if (kind === 'create') setState('unreleased');
  });
  const denied = [access.error, blocks.error, mutation.error].find(inventoryScopeDenied);
  function resetEditor() {
    if (!mutation.isPending) {
      setAdding(false);
      setReleasing(undefined);
      mutation.reset();
    }
  }
  async function retry() {
    resetEditor();
    await Promise.all([access.refetch(), blocks.refetch()]);
  }
  if (denied)
    return (
      <section aria-label="Branch inventory blocks">
        <p role="alert">{errorMessage(denied)}</p>
        <Button variant="secondary" onClick={() => void retry()}>
          Retry block access
        </Button>
      </section>
    );
  if (access.isPending || blocks.isPending)
    return <p role="status">Loading branch inventory blocks…</p>;
  if (!access.data || !blocks.data)
    return (
      <section aria-label="Branch inventory blocks">
        <p role="alert">{errorMessage(access.error ?? blocks.error)}</p>
        <Button variant="secondary" onClick={() => void retry()}>
          Retry blocks
        </Button>
      </section>
    );
  const rows = blocks.data.pages.flatMap((page) => page.data);
  const canManage = access.data.permissions.includes('block_manage'),
    pending = mutation.isPending;
  const selected = rows.find((block) => block.id === releasing && block.releasedAt === null);
  return (
    <section aria-label="Branch inventory blocks" className="space-y-4">
      <h2 className="text-xl font-semibold">Manual blocks and maintenance</h2>
      <p>
        Blocks apply to the displayed date range. Unreleased past blocks do not imply current
        unavailability.
      </p>
      <label className="field-label">
        Block history filter
        <select
          className="field-input"
          value={state}
          disabled={pending}
          onChange={(event) => {
            const value = event.target.value;
            if (value !== 'unreleased' && value !== 'released' && value !== 'all') return;
            resetEditor();
            setNotice('');
            setState(value);
          }}
        >
          <option value="unreleased">Unreleased blocks</option>
          <option value="released">Released history</option>
          <option value="all">All blocks</option>
        </select>
      </label>
      {access.isError || blocks.isError ? (
        <div>
          <p role="alert">
            Block data could not refresh. Displayed values may be out of date.{' '}
            {access.isError ? 'Refresh access before submitting changes.' : ''}
          </p>
          <Button
            variant="secondary"
            onClick={() => void Promise.all([access.refetch(), blocks.refetch()])}
          >
            Refresh blocks
          </Button>
        </div>
      ) : null}
      {mutation.isError ? <p role="alert">{errorMessage(mutation.error)}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {!canManage ? (
        <p>Block creation and release require an explicit block-management grant.</p>
      ) : (
        <Button
          disabled={pending || access.isError || access.isFetching}
          onClick={() => {
            resetEditor();
            setAdding(true);
            setNotice('');
          }}
        >
          New inventory block
        </Button>
      )}
      {adding && canManage ? (
        <InventoryBlockPagedForm
          actorId={actorId}
          branchId={branchId}
          pending={pending}
          disabled={access.isError || access.isFetching}
          onCancel={resetEditor}
          onSave={(input) => mutation.mutate({ kind: 'create', input })}
        />
      ) : null}
      {releasing && !selected ? (
        <div>
          <p role="alert">This block is no longer unreleased in the current view.</p>
          <Button variant="secondary" onClick={resetEditor}>
            Close unavailable block
          </Button>
        </div>
      ) : null}
      {selected && canManage ? (
        <ReleaseBlockForm
          key={selected.id}
          label={
            'Room ' +
            selected.roomLabel +
            (selected.bedLabel ? ', bed ' + selected.bedLabel : ', all beds')
          }
          pending={pending}
          disabled={access.isError || access.isFetching}
          onCancel={resetEditor}
          onSave={(reason) => mutation.mutate({ kind: 'release', id: selected.id, reason })}
        />
      ) : null}
      {!rows.length ? <p>No blocks match this filter.</p> : null}
      {rows.map((block) => (
        <article key={block.id} className="space-y-2 rounded-panel border border-hsm-border p-4">
          <h3 className="font-semibold">
            Room {block.roomLabel}
            {block.bedLabel ? ', bed ' + block.bedLabel : ' · All beds'}
          </h3>
          <p>
            {block.kind === 'maintenance' ? 'Maintenance' : 'Manual reservation'} ·{' '}
            {block.releasedAt ? 'Released' : 'Unreleased'}
          </p>
          <p>
            {block.range.moveInDate} until {block.range.moveOutDate} (end excluded)
          </p>
          <p>Created {karachiDateTime(block.createdAt)}</p>
          {block.releasedAt ? (
            <p>Released {karachiDateTime(block.releasedAt)}</p>
          ) : canManage ? (
            <Button
              variant="secondary"
              disabled={pending || access.isError}
              onClick={() => {
                resetEditor();
                setReleasing(block.id);
                setNotice('');
              }}
            >
              Release block for room {block.roomLabel} from {block.range.moveInDate}
            </Button>
          ) : null}
        </article>
      ))}
      {blocks.hasNextPage ? (
        <Button
          variant="secondary"
          disabled={pending || blocks.isFetchingNextPage}
          onClick={() => void blocks.fetchNextPage()}
        >
          Load more blocks
        </Button>
      ) : null}
    </section>
  );
}

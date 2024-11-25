'use client';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  executeInventoryImport,
  inventoryImportTemplate,
  readInventoryImport,
  RetainedInventoryImport,
  type InventoryImportCommand,
} from '@hsm/api-client';
import { inventoryImportIdentitySchema, type InventoryImportKind } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { PrivateFileInput } from './private-file-input';
import { useInventoryNavigationLock } from './inventory-navigation';
type Props = {
  actorId: string;
  branchId: string;
  roomTypes: { id: string; name: string; archivedAt: string | null }[];
  unavailable: boolean;
  blocked: boolean;
};
export function InventoryImport(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId} {...props} />;
}
function Panel({ actorId, branchId, roomTypes, unavailable, blocked }: Props) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState<InventoryImportKind>('rooms'),
    [typeId, setType] = useState(''),
    [fileId, setFile] = useState<string>(),
    [uploadBusy, setUploadBusy] = useState(false),
    [scanPending, setScanPending] = useState(false),
    [runId, setRun] = useState<string>(),
    [offset, setOffset] = useState(0);
  const cache = useQueryClient(),
    retained = useRef<RetainedInventoryImport | null>(null),
    queryKey = ['inventory-import', actorId, branchId];
  retained.current ??= new RetainedInventoryImport((command, key) =>
    executeInventoryImport(browserClient(), branchId, command, key),
  );
  const intent = retained.current;
  const preview = useQuery({
    queryKey: [...queryKey, runId, offset],
    enabled: Boolean(runId),
    retry: false,
    queryFn: () => {
      if (!runId) throw new Error('Import unavailable');
      return readInventoryImport(browserClient(), branchId, runId, { offset, limit: 50 });
    },
  });
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (command: InventoryImportCommand | undefined) =>
      command ? intent.send(command, crypto.randomUUID()) : intent.retry(),
    onSuccess: async (value) => {
      const result = inventoryImportIdentitySchema.parse(value);
      setRun(result.id);
      setOffset(0);
      intent.reset();
      await cache.invalidateQueries({ queryKey });
      await cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] });
    },
  });
  const template = useMutation({
    retry: false,
    mutationFn: () => inventoryImportTemplate(browserClient(), branchId, kind, typeId || undefined),
    onSuccess: (value) => {
      const url = URL.createObjectURL(new Blob([value.csv], { type: 'text/csv' })),
        link = document.createElement('a');
      link.href = url;
      link.download = value.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    },
  });
  const locked = intent.locked || mutation.isPending,
    busy = locked || uploadBusy || template.isPending;
  useInventoryNavigationLock(open || busy);
  if (!open)
    return (
      <Button variant="secondary" disabled={blocked || unavailable} onClick={() => setOpen(true)}>
        Import inventory CSV
      </Button>
    );
  const data = !unavailable && !preview.isError && !preview.isFetching ? preview.data : undefined;
  return (
    <section className="space-y-3" aria-label="Inventory CSV import">
      <h3 className="font-semibold">Inventory CSV import</h3>
      <p>
        Validate all records before committing. Up to 500 records and 5000 new beds per batch. New
        rooms and beds start inactive; review their photos and availability separately.
      </p>
      <label className="field-label">
        Import kind
        <select
          className="field-input"
          value={kind}
          disabled={busy || unavailable}
          onChange={(event) => {
            setKind(event.target.value === 'seats' ? 'seats' : 'rooms');
            setFile(undefined);
            setRun(undefined);
            setType('');
          }}
        >
          <option value="rooms">Rooms with capacity-sized beds</option>
          <option value="seats">Beds in existing rooms</option>
        </select>
      </label>
      {kind === 'rooms' ? (
        <label className="field-label">
          Room type for CSV template
          <select
            className="field-input"
            value={typeId}
            disabled={busy || unavailable}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Choose a room type</option>
            {roomTypes
              .filter((type) => !type.archivedAt)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
          </select>
        </label>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy || unavailable || (kind === 'rooms' && !typeId)}
        onClick={() => template.mutate()}
      >
        Download CSV template
      </Button>
      <p>
        Keep the template headers. Fill room numbers; room templates include the selected type
        identifier. Bed templates use existing room numbers and unique bed labels.
      </p>
      <PrivateFileInput
        key={kind}
        id="inventory-csv"
        label="Inventory CSV file"
        purpose="import"
        disabled={busy || unavailable}
        onReady={(value) => {
          setFile(value);
          setRun(undefined);
        }}
        onBusy={setUploadBusy}
        onPending={setScanPending}
      />
      <Button
        disabled={busy || scanPending || unavailable || !fileId}
        onClick={() => {
          if (fileId) mutation.mutate({ kind: 'validate', body: { kind, fileId } });
        }}
      >
        Validate CSV
      </Button>
      {mutation.error || template.error ? (
        <p role="alert">{errorMessage(mutation.error ?? template.error)}</p>
      ) : null}
      {locked && !mutation.isPending ? (
        <Button disabled={unavailable} onClick={() => mutation.mutate(undefined)}>
          Retry original import command
        </Button>
      ) : null}
      {preview.isFetching ? <p role="status">Loading current import preview…</p> : null}
      {runId && preview.error ? <p role="alert">{errorMessage(preview.error)}</p> : null}
      {runId ? (
        <Button
          variant="secondary"
          disabled={busy || preview.isFetching || unavailable}
          onClick={() => void preview.refetch()}
        >
          Refresh import preview
        </Button>
      ) : null}
      {data ? (
        <div className="space-y-3">
          <p>
            {data.totalRows} records · {data.errorRows} records with errors · {data.status}
          </p>
          {data.status === 'committed' ? (
            <p role="status">All records committed. Imported inventory is inactive.</p>
          ) : null}
          <ul>
            {data.rows.map((row) => (
              <li key={row.recordNumber}>
                Record {row.recordNumber}: room {row.roomNumber}
                {row.bedLabel ? ', bed ' + row.bedLabel : ''} ·{' '}
                {row.errors.length
                  ? row.errors.map((error) => error.replaceAll('_', ' ').toLowerCase()).join('; ')
                  : 'Valid'}
              </li>
            ))}
          </ul>
          {offset ? (
            <Button variant="secondary" disabled={busy} onClick={() => setOffset(0)}>
              First preview records
            </Button>
          ) : null}
          {data.nextOffset !== null ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => setOffset(data.nextOffset ?? 0)}
            >
              Next preview records
            </Button>
          ) : null}
          {data.status === 'validated' && !data.errorRows ? (
            <Button
              disabled={busy || unavailable}
              onClick={() => mutation.mutate({ kind: 'commit', runId: data.id })}
            >
              Commit all {data.totalRows} records
            </Button>
          ) : null}
          {data.status === 'failed' ? (
            <p>Correct the CSV errors and upload a new file. Nothing was imported.</p>
          ) : null}
        </div>
      ) : null}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={() => {
          intent.reset();
          mutation.reset();
          setOpen(false);
        }}
      >
        Close CSV import
      </Button>
    </section>
  );
}

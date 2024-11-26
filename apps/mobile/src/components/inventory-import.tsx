import { AppHeader } from './navigation/header';
import { useToolOpen } from './inventory-tools';
import { Skeleton } from './loading/skeleton';
import { useRef, useState } from 'react';
import { Share, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  executeInventoryImport,
  inventoryImportTemplate,
  readInventoryImport,
  RetainedInventoryImport,
  type InventoryImportCommand,
} from '@hsm/api-client';
import { inventoryImportIdentitySchema, type InventoryImportKind } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { PrivateFilePicker } from './private-file-picker';
import { useNativeInventoryNavigationLock } from './native-inventory-navigation';
type Props = {
  actorId: string;
  branchId: string;
  roomTypes: { id: string; name: string; archivedAt: string | null }[];
  unavailable: boolean;
  blocked: boolean;
};
export function NativeInventoryImport(props: Props) {
  return <Panel key={props.actorId + ':' + props.branchId} {...props} />;
}
function Panel({ actorId, branchId, roomTypes, unavailable, blocked }: Props) {
  const [open, setOpen] = useToolOpen(),
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
  retained.current ??= new RetainedInventoryImport(async (command, key) =>
    executeInventoryImport(await actorClient(actorId), branchId, command, key),
  );
  const intent = retained.current;
  const preview = useQuery({
    queryKey: [...queryKey, runId, offset],
    enabled: Boolean(runId),
    retry: false,
    queryFn: async () => {
      if (!runId) throw new Error('Import unavailable');
      return readInventoryImport(await actorClient(actorId), branchId, runId, {
        offset,
        limit: 50,
      });
    },
  });
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (command: InventoryImportCommand | undefined) =>
      command ? intent.send(command, Crypto.randomUUID()) : intent.retry(),
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
    mutationFn: async () =>
      inventoryImportTemplate(await actorClient(actorId), branchId, kind, typeId || undefined),
    onSuccess: async (value) => {
      await Share.share({ title: value.fileName, message: value.csv });
    },
  });
  const locked = intent.locked || mutation.isPending,
    busy = locked || uploadBusy || template.isPending;
  useNativeInventoryNavigationLock(open || busy);
  if (!open)
    return (
      <Button
        secondary
        disabled={blocked || unavailable}
        onPress={() => setOpen(true)}
        label="Import inventory CSV"
      />
    );
  const data = !unavailable && !preview.isError && !preview.isFetching ? preview.data : undefined;
  return (
    <View className="gap-3">
      <AppHeader
        title="Import CSV"
        backLabel="Close CSV import"
        backDisabled={busy}
        onBack={() => {
          intent.reset();
          mutation.reset();
          setOpen(false);
        }}
      />
      <Copy>Checked before saving · up to 500 rows · new rooms start inactive</Copy>
      {(['rooms', 'seats'] as const).map((value) => (
        <Button
          key={value}
          secondary={kind !== value}
          disabled={busy || unavailable}
          label={value === 'rooms' ? 'Import rooms with beds' : 'Import beds in existing rooms'}
          onPress={() => {
            setKind(value);
            setFile(undefined);
            setRun(undefined);
            setType('');
          }}
        />
      ))}
      {kind === 'rooms' ? (
        <View className="gap-2">
          <Copy>Room type for CSV template</Copy>
          {roomTypes
            .filter((type) => !type.archivedAt)
            .map((type) => (
              <Button
                key={type.id}
                secondary={typeId !== type.id}
                label={'Template for ' + type.name}
                disabled={busy || unavailable}
                onPress={() => setType(type.id)}
              />
            ))}
        </View>
      ) : null}
      <Button
        secondary
        disabled={busy || unavailable || (kind === 'rooms' && !typeId)}
        onPress={() => template.mutate()}
        label="Share CSV template"
      />
      <Copy>Keep the headers · fill room numbers · bed rows use existing rooms</Copy>
      <PrivateFilePicker
        key={kind}
        label="Inventory CSV file"
        actorId={actorId}
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
        onPress={() => {
          if (fileId) mutation.mutate({ kind: 'validate', body: { kind, fileId } });
        }}
        label="Validate CSV"
      />
      {mutation.error || template.error ? (
        <Copy alert>{safeMessage(mutation.error ?? template.error)}</Copy>
      ) : null}
      {locked && !mutation.isPending ? (
        <Button
          disabled={unavailable}
          onPress={() => mutation.mutate(undefined)}
          label="Retry original import command"
        />
      ) : null}
      {preview.isFetching ? (
        <Skeleton kind="table" label="Loading current import preview…" />
      ) : null}
      {runId && preview.error ? <Copy alert>{safeMessage(preview.error)}</Copy> : null}
      {data ? (
        <View className="gap-3">
          <Copy>
            {data.totalRows} records · {data.errorRows} records with errors · {data.status}
          </Copy>
          {data.status === 'committed' ? (
            <Copy>All records committed. Imported inventory is inactive.</Copy>
          ) : null}
          {data.rows.map((row) => (
            <Copy key={row.recordNumber}>
              Record {row.recordNumber}: room {row.roomNumber}
              {row.bedLabel ? ', bed ' + row.bedLabel : ''} ·{' '}
              {row.errors.length
                ? row.errors.map((error) => error.replaceAll('_', ' ').toLowerCase()).join('; ')
                : 'Valid'}
            </Copy>
          ))}
          {offset ? (
            <Button
              secondary
              disabled={busy}
              onPress={() => setOffset(0)}
              label="First preview records"
            />
          ) : null}
          {data.nextOffset !== null ? (
            <Button
              secondary
              disabled={busy}
              onPress={() => setOffset(data.nextOffset ?? 0)}
              label="Next preview records"
            />
          ) : null}
          {data.status === 'validated' && !data.errorRows ? (
            <Button
              disabled={busy || unavailable}
              onPress={() => mutation.mutate({ kind: 'commit', runId: data.id })}
              label={'Commit all ' + data.totalRows + ' records'}
            />
          ) : null}
          {data.status === 'failed' ? (
            <Copy>Correct the CSV errors and upload a new file. Nothing was imported.</Copy>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

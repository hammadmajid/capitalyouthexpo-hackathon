import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  attachAgreementFile,
  readAgreementFiles,
  readAgreementFileUrl,
  type AgreementDocumentTarget,
} from '@hsm/api-client';
import { agreementFileInputSchema } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { PrivateFilePicker } from './private-file-picker';
import { useNativeCommand } from './services/use-command';
import { NativeCommandRecovery } from './services/command-recovery';
import { Skeleton } from './loading/skeleton';
import { Button, Copy } from './ui';
export function AgreementDocuments(props: {
  actorId: string;
  target: AgreementDocumentTarget;
  templateFileId?: string | null | undefined;
  embedded?: boolean;
}) {
  const { actorId, target } = props;
  const [open, setOpen] = useState(props.embedded ?? false),
    [fileId, setFileId] = useState<string>(),
    [label, setLabel] = useState('Agreement scan'),
    [uploading, setUploading] = useState(false),
    [opening, setOpening] = useState(false),
    [message, setMessage] = useState('');
  const key = [
    'agreement-files',
    actorId,
    target.branchId ?? 'own',
    target.stayId,
    target.agreementId,
  ];
  const query = useInfiniteQuery({
    queryKey: key,
    retry: false,
    enabled: open,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      readAgreementFiles(await actorClient(actorId), target, {
        limit: 20,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const command = useNativeCommand<{ fileId: string; label: string }>(
    'agreement-file:' + target.agreementId,
    actorId,
    (client, input, commandKey) => attachAgreementFile(client, target, input, commandKey),
    [key],
  );
  const busy = uploading || command.isPending || command.unresolved;
  async function save() {
    const input = agreementFileInputSchema.safeParse({ fileId, label });
    if (!input.success || busy) {
      setMessage('Choose a checked document and enter its name.');
      return;
    }
    try {
      await command.mutateAsync(input.data);
      setFileId(undefined);
      setMessage('Agreement scan saved.');
    } catch {
      /* Recovery remains available below. */
    }
  }
  async function view(file: string) {
    if (opening) return;
    setOpening(true);
    setMessage('');
    try {
      const result = await readAgreementFileUrl(await actorClient(actorId), target, file);
      await Linking.openURL(result.url);
    } catch (error) {
      setMessage(safeMessage(error));
    } finally {
      setOpening(false);
    }
  }
  return (
    <View className="gap-2">
      {props.embedded ? null : (
        <Button
          secondary
          label={open ? 'Hide agreement documents' : 'Agreement documents'}
          onPress={() => setOpen(!open)}
        />
      )}
      {open ? (
        <>
          {query.isPending ? <Skeleton kind="list" label="Loading agreement documents" /> : null}
          {query.error || command.error ? (
            <Copy alert>{safeMessage(query.error ?? command.error)}</Copy>
          ) : null}
          <NativeCommandRecovery command={command} />
          {props.templateFileId ? (
            <Button
              secondary
              label="Open original template document"
              disabled={opening}
              onPress={() => void view(props.templateFileId ?? '')}
            />
          ) : null}
          {!query.isError
            ? query.data?.pages
                .flatMap((page) => page.data)
                .map((row) => (
                  <Button
                    key={row.id}
                    secondary
                    label={row.label}
                    disabled={opening}
                    onPress={() => void view(row.fileId)}
                  />
                ))
            : null}
          {query.data?.pages[0]?.data.length === 0 && !query.isError ? (
            <Copy>No photos yet</Copy>
          ) : null}
          {query.hasNextPage ? (
            <Button
              secondary
              label="More agreement scans"
              disabled={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
            />
          ) : null}
          <PrivateFilePicker
            actorId={actorId}
            purpose="stay_agreement"
            label="agreement photo"
            hideLabel
            hideHint
            onReady={setFileId}
            onBusy={setUploading}
            disabled={busy}
          />
          {fileId ? (
            <>
              <TextInput
                accessibilityLabel="Agreement scan name"
                value={label}
                maxLength={120}
                onChangeText={setLabel}
                className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
              />
              <Button label="Save agreement scan" disabled={busy} onPress={() => void save()} />
            </>
          ) : null}
          {message ? <Copy>{message}</Copy> : null}
        </>
      ) : null}
    </View>
  );
}

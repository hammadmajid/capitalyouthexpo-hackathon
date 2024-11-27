import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { complaintCategorySchema } from '@hsm/contracts';
import {
  createComplaint,
  readOwnComplaint,
  readOwnComplaints,
  residentComplaintAction,
} from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from '../marketplace/action';
import { PrivateFilePicker } from '../private-file-picker';
import { useNativeCommand } from './use-command';
import { NativeCommandRecovery } from './command-recovery';
import { field, statusText } from './resident-text';
function useOwn<T>(
  actorId: string,
  key: string,
  stayId: string,
  read: (client: Awaited<ReturnType<typeof actorClient>>) => Promise<T>,
  enabled = true,
) {
  return useQuery({
    queryKey: [key, actorId, stayId],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: async () => read(await actorClient(actorId)),
  });
}
// CMP-001..006: own complaints; accept or reopen a resolution; none for a past Stay.
export function OwnComplaints({
  actorId,
  stayId,
  closed,
}: {
  actorId: string;
  stayId: string;
  closed: boolean;
}) {
  const list = useOwn(actorId, 'own-complaints', stayId, (client) =>
    readOwnComplaints(client, stayId),
  );
  const [selected, setSelected] = useState<string>();
  const detail = useOwn(
    actorId,
    'own-complaint:' + (selected ?? ''),
    stayId,
    (client) => readOwnComplaint(client, stayId, selected),
    Boolean(selected),
  );
  const [form, setForm] = useState({ category: 'other', title: '', description: '', note: '' });
  const [fileId, setFileId] = useState<string>(),
    [busy, setBusy] = useState(false);
  const refresh = [
    ['own-complaints', actorId, stayId],
    ['own-complaint:' + (selected ?? ''), actorId, stayId],
  ];
  const create = useNativeCommand(
    'OwnComplaints:create',
    actorId,
    (client, body: Record<string, unknown>, key) => createComplaint(client, stayId, body, key),
    refresh,
  );
  const act = useNativeCommand(
    'OwnComplaints:act',
    actorId,
    (client, body: { id: string; input: Record<string, unknown> }, key) =>
      residentComplaintAction(client, stayId, body.id, body.input, key),
    refresh,
  );
  const d = detail.data;
  return (
    <View className="gap-1" accessibilityLabel="Complaints">
      <NativeCommandRecovery command={create} />
      <NativeCommandRecovery command={act} />
      {create.isError || act.isError ? (
        <Copy alert>{safeMessage(create.error ?? act.error)}</Copy>
      ) : null}
      {create.isSuccess ? <Copy>Complaint sent to the hostel.</Copy> : null}
      {list.data?.data.map((row) => (
        <Button
          key={row.id}
          secondary
          label={`${row.title}: ${statusText[row.status]}`}
          onPress={() => setSelected(row.id)}
        />
      ))}
      {d ? (
        <View className="gap-1">
          {d.events.map((event) => (
            <Copy key={event.id}>
              {event.createdAt.slice(0, 10)} · {event.actorName}: {statusText[event.toStatus]}
              {event.note ? ' — ' + event.note : ''}
            </Copy>
          ))}
          {d.status === 'resolved' ? (
            <>
              <Button
                label="Confirm it is fixed"
                onPress={() =>
                  act.mutate({ id: d.id, input: { action: 'accept', expectedVersion: d.version } })
                }
              />
              {!closed ? (
                <>
                  <TextInput
                    accessibilityLabel="Why it is not fixed"
                    value={form.note}
                    onChangeText={(note) => setForm({ ...form, note })}
                    maxLength={2000}
                    className={field}
                  />
                  <Button
                    secondary
                    label="Reopen complaint"
                    disabled={!form.note.trim()}
                    onPress={() =>
                      act.mutate({
                        id: d.id,
                        input: {
                          action: 'reopen',
                          expectedVersion: d.version,
                          note: form.note.trim(),
                        },
                      })
                    }
                  />
                </>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
      {closed ? (
        <Copy>New complaints cannot be raised for a past Stay.</Copy>
      ) : (
        <>
          <View className="flex-row flex-wrap gap-1">
            {complaintCategorySchema.options.map((category) => (
              <Button
                key={category}
                secondary={form.category !== category}
                label={category}
                onPress={() => setForm({ ...form, category })}
              />
            ))}
          </View>
          <TextInput
            accessibilityLabel="Complaint title"
            value={form.title}
            onChangeText={(title) => setForm({ ...form, title })}
            maxLength={120}
            className={field}
          />
          <TextInput
            accessibilityLabel="Describe the problem"
            value={form.description}
            onChangeText={(description) => setForm({ ...form, description })}
            maxLength={2000}
            multiline
            className={field}
          />
          <PrivateFilePicker
            actorId={actorId}
            label="Photo or document (optional)"
            purpose="complaint_attachment"
            onReady={setFileId}
            onBusy={setBusy}
          />
          <Button
            label="Send complaint"
            disabled={!form.title.trim() || !form.description.trim() || busy || create.isPending}
            onPress={() =>
              create.mutate({
                category: form.category,
                title: form.title.trim(),
                description: form.description.trim(),
                attachmentFileIds: fileId ? [fileId] : [],
              })
            }
          />
        </>
      )}
    </View>
  );
}

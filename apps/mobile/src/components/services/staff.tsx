import { Skeleton } from '../loading/skeleton';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  readBranchComplaint,
  readBranchComplaints,
  readBranchMenu,
  readBranchReviews,
  replyToReview,
  staffComplaintAction,
  updateBranchMenu,
} from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
import { safeMessage } from '../../lib/messages';
import { Copy } from '../ui';
import { MarketplaceAction as Button } from '../marketplace/action';
import { field, statusText } from './resident';
import { useNativeCommand } from './use-command';
import { NativeCommandRecovery } from './command-recovery';
const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const meals = ['breakfast', 'lunch', 'dinner'] as const;
function useBranch<T>(
  actorId: string,
  key: string,
  branchId: string,
  read: (c: Awaited<ReturnType<typeof actorClient>>) => Promise<T>,
  enabled = true,
) {
  return useQuery({
    queryKey: [key, actorId, branchId],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: async () => read(await actorClient(actorId)),
  });
}
// Manager mobile (MGRD): menu, complaint queue and review replies (transport has its own tab).
export function NativeBranchServices({
  actorId,
  branchId,
  standalone = false,
  complaintsOnly = false,
}: {
  actorId: string;
  branchId: string;
  // On its own screen (Manager tool) the services show straight away.
  standalone?: boolean;
  // The Branch Operations Complaints tab contains no menu or review tools.
  complaintsOnly?: boolean;
}) {
  const [open, setOpen] = useState(standalone);
  if (complaintsOnly) return <ComplaintQueue actorId={actorId} branchId={branchId} />;
  if (!open)
    return <Button secondary label="Menu, complaints and reviews" onPress={() => setOpen(true)} />;
  return (
    <View className="gap-3" accessibilityLabel="Branch services">
      <MenuEditor actorId={actorId} branchId={branchId} />
      <ComplaintQueue actorId={actorId} branchId={branchId} />
      <ReviewReplies actorId={actorId} branchId={branchId} />
    </View>
  );
}
function MenuEditor({ actorId, branchId }: { actorId: string; branchId: string }) {
  const menu = useBranch(actorId, 'branch-menu', branchId, (c) => readBranchMenu(c, branchId));
  const [draft, setDraft] = useState<Record<string, string>>();
  const save = useNativeCommand(
    'NativeBranchServices:save',
    actorId,
    (c, body: Record<string, unknown>, key) => updateBranchMenu(c, branchId, body, key),
    [['branch-menu', actorId, branchId]],
  );
  if (!menu.data)
    return menu.isError ? (
      <Copy alert>{safeMessage(menu.error)}</Copy>
    ) : (
      <Skeleton kind="inline" label="Loading menu…" />
    );
  const current =
    draft ??
    Object.fromEntries(
      menu.data.items.map((item) => [item.dayOfWeek + ':' + item.meal, item.description]),
    );
  return (
    <View className="gap-1" accessibilityLabel="Menu editor">
      <NativeCommandRecovery command={save} />
      {save.isError ? <Copy alert>{safeMessage(save.error)}</Copy> : null}
      {save.isSuccess ? <Copy>Menu saved.</Copy> : null}
      {days.map((day, index) =>
        meals.map((meal) => {
          const key = index + 1 + ':' + meal;
          return (
            <TextInput
              key={key}
              accessibilityLabel={`${day} ${meal}`}
              placeholder={`${day} ${meal}`}
              value={current[key] ?? ''}
              onChangeText={(text) => setDraft({ ...current, [key]: text })}
              maxLength={200}
              className={field}
            />
          );
        }),
      )}
      <Button
        label="Save menu"
        disabled={save.isPending}
        onPress={() =>
          save.mutate({
            expectedVersion: menu.data.version,
            items: Object.entries(current)
              .filter(([, text]) => text.trim())
              .map(([key, description]) => ({
                dayOfWeek: Number(key.split(':')[0]),
                meal: key.split(':')[1],
                description: description.trim(),
              })),
          })
        }
      />
    </View>
  );
}
function ComplaintQueue({ actorId, branchId }: { actorId: string; branchId: string }) {
  const list = useBranch(actorId, 'branch-complaints', branchId, (c) =>
    readBranchComplaints(c, branchId),
  );
  const [selected, setSelected] = useState<string>(),
    [note, setNote] = useState('');
  const detail = useBranch(
    actorId,
    'branch-complaint:' + (selected ?? ''),
    branchId,
    (c) => readBranchComplaint(c, branchId, selected),
    Boolean(selected),
  );
  const act = useNativeCommand(
    'NativeBranchServices:act',
    actorId,
    (c, body: { id: string; input: Record<string, unknown> }, key) =>
      staffComplaintAction(c, branchId, body.id, body.input, key),
    [
      ['branch-complaints', actorId, branchId],
      ['branch-complaint:' + (selected ?? ''), actorId, branchId],
    ],
  );
  const d = detail.data;
  return (
    <View className="gap-1" accessibilityLabel="Complaint queue">
      {list.isPending ? <Skeleton kind="list" label="Loading complaints…" /> : null}
      {list.isError ? <Copy alert>{safeMessage(list.error)}</Copy> : null}
      {list.data && !list.isError && list.data.data.length === 0 ? (
        <Copy>No complaints</Copy>
      ) : null}
      <NativeCommandRecovery command={act} />
      {act.isError ? <Copy alert>{safeMessage(act.error)}</Copy> : null}
      {list.data?.data.map((row) => (
        <Button
          key={row.id}
          secondary
          label={`${row.residentName} · ${row.title}: ${statusText[row.status]}`}
          onPress={() => setSelected(row.id)}
        />
      ))}
      {d && ['open', 'reopened', 'assigned', 'in_progress'].includes(d.status) ? (
        <>
          <Copy>{d.description}</Copy>
          <Button
            secondary
            label="Start work"
            disabled={d.status === 'in_progress' || act.isPending}
            onPress={() =>
              act.mutate({ id: d.id, input: { action: 'start', expectedVersion: d.version } })
            }
          />
          <TextInput
            accessibilityLabel="Resolution note"
            value={note}
            onChangeText={setNote}
            maxLength={2000}
            className={field}
          />
          <Button
            label="Mark resolved"
            disabled={!note.trim() || act.isPending}
            onPress={() =>
              act.mutate({
                id: d.id,
                input: { action: 'resolve', expectedVersion: d.version, note: note.trim() },
              })
            }
          />
        </>
      ) : null}
    </View>
  );
}
function ReviewReplies({ actorId, branchId }: { actorId: string; branchId: string }) {
  const list = useBranch(actorId, 'branch-reviews', branchId, (c) =>
    readBranchReviews(c, branchId),
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const reply = useNativeCommand(
    'NativeBranchServices:reply',
    actorId,
    (c, body: { id: string; text: string }, key) =>
      replyToReview(c, branchId, body.id, { body: body.text }, key),
    [['branch-reviews', actorId, branchId]],
  );
  return (
    <View className="gap-1" accessibilityLabel="Reviews">
      <NativeCommandRecovery command={reply} />
      {reply.isError ? <Copy alert>{safeMessage(reply.error)}</Copy> : null}
      {list.data?.data.map((row) => (
        <View key={row.id} className="gap-1">
          <Copy>
            {row.reviewerName} · overall {row.ratings.overall}/5 · {row.status}
            {row.reply ? ' · replied' : ''}
          </Copy>
          {row.status === 'published' ? (
            <>
              <TextInput
                accessibilityLabel={'Reply to ' + row.reviewerName}
                value={drafts[row.id] ?? ''}
                onChangeText={(text) => setDrafts({ ...drafts, [row.id]: text })}
                maxLength={1000}
                className={field}
              />
              <Button
                secondary
                label="Post public reply"
                disabled={!(drafts[row.id] ?? '').trim()}
                onPress={() => reply.mutate({ id: row.id, text: (drafts[row.id] ?? '').trim() })}
              />
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}
export { NativePublicServices } from './public';

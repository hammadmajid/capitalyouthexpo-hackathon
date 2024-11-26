import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  archiveListingRule,
  createListingRule,
  editListingRule,
  listListingRules,
} from '@hsm/api-client';
import type { PrivateListingRule } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { withFreshSession } from '../lib/fresh-session';
import { safeMessage } from '../lib/messages';
import { useNativeCommand } from './services/use-command';
import { Skeleton } from './loading/skeleton';
import { SetupButton, SetupCard, SetupText } from './owner-wizard-ui';
import { IconHead } from './owner-icon-head';
import { Check, Pencil, Plus, ScrollText, Trash2, X, type LucideIcon } from 'lucide-react-native';
import { mobileColors } from '@hsm/ui';
type Command =
  | { kind: 'save'; body: string; sortOrder: number; row?: PrivateListingRule }
  | { kind: 'archive'; row: PrivateListingRule; reason: string };

// LIST-001 / SEC-001: reuse versioned branch rules, with archive rather than deletion.
// Round icon button; filled for the main action.
function SmallIcon(props: {
  Icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  filled?: boolean;
}) {
  const disabled = props.disabled ?? false;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={props.onPress}
      style={{
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.filled ? mobileColors.primary : mobileColors.icy,
        borderWidth: props.filled ? 0 : 1,
        borderColor: mobileColors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <props.Icon size={18} color={props.filled ? mobileColors.surface : mobileColors.primary} />
    </Pressable>
  );
}
export function OwnerHostelRules({ actorId, branchId }: { actorId: string; branchId: string }) {
  const key = ['owner-hostel-rules', actorId, branchId];
  const query = useInfiniteQuery({
    queryKey: key,
    initialPageParam: null as string | null,
    retry: false,
    queryFn: ({ pageParam }) =>
      withFreshSession(async () =>
        listListingRules(await actorClient(actorId), branchId, {
          limit: 20,
          ...(pageParam ? { cursor: pageParam } : {}),
        }),
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const [editing, setEditing] = useState<PrivateListingRule>();
  const [archiving, setArchiving] = useState<PrivateListingRule>();
  const [body, setBody] = useState(''),
    [order, setOrder] = useState('0'),
    [reason, setReason] = useState('');
  const command = useNativeCommand<Command>(
    'owner-hostel-rules:' + branchId,
    actorId,
    (client, input, commandKey) => {
      if (input.kind === 'archive')
        return archiveListingRule(
          client,
          branchId,
          input.row.id,
          input.row.version,
          { reason: input.reason },
          commandKey,
        );
      const value = { body: input.body, sortOrder: input.sortOrder };
      return input.row
        ? editListingRule(client, branchId, input.row.id, input.row.version, value, commandKey)
        : createListingRule(client, branchId, value, commandKey);
    },
    [key, ['public-listing-rules', branchId]],
  );
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const allowed = query.data?.pages[0]?.canEdit ?? false;
  const busy = command.isPending || command.unresolved;
  const failure = query.error ?? command.error;
  async function save(position?: number) {
    await command.mutateAsync({
      kind: 'save',
      body: body.trim(),
      sortOrder: position ?? Number(order),
      ...(editing ? { row: editing } : {}),
    });
    setEditing(undefined);
    setBody('');
    setOrder('0');
  }
  return (
    <SetupCard>
      <IconHead Icon={ScrollText} title="House rules" note="Residents see these" />
      {query.isPending ? <Skeleton kind="list" label="Loading hostel rules" /> : null}
      {!query.isPending && !query.isError && !rows.length ? (
        <SetupText muted>No rules yet</SetupText>
      ) : null}
      {/* Numbered list; the selected rule shows its edit or archive row in place. */}
      <View style={{ gap: 6 }}>
        {rows.map((row, index) => (
          <View key={row.id} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: mobileColors.aqua,
                }}
              >
                <Text className="font-heading text-xs text-primary">{index + 1}</Text>
              </View>
              <Text className="flex-1 font-body text-body text-text">{row.body}</Text>
              {allowed ? (
                <>
                  <SmallIcon
                    Icon={Pencil}
                    label="Edit rule"
                    disabled={busy}
                    onPress={() => {
                      setEditing(row);
                      setBody(row.body);
                      setOrder(String(row.sortOrder));
                      setArchiving(undefined);
                    }}
                  />
                  <SmallIcon
                    Icon={Trash2}
                    label="Archive rule"
                    disabled={busy}
                    onPress={() => {
                      setArchiving(row);
                      setEditing(undefined);
                      setBody('');
                    }}
                  />
                </>
              ) : null}
            </View>
            {archiving?.id === row.id ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 36 }}>
                <TextInput
                  accessibilityLabel="Archive reason"
                  placeholder="Reason"
                  placeholderTextColor={mobileColors.secondary}
                  value={reason}
                  onChangeText={setReason}
                  maxLength={500}
                  editable={!busy}
                  className="min-h-10 flex-1 rounded-input border border-border bg-inputSurface px-3 text-text"
                />
                <SmallIcon
                  Icon={Check}
                  label="Confirm archive"
                  disabled={busy || !reason.trim()}
                  onPress={() => {
                    void command
                      .mutateAsync({ kind: 'archive', row, reason: reason.trim() })
                      .then(() => {
                        setArchiving(undefined);
                        setReason('');
                      })
                      .catch(() => undefined);
                  }}
                />
                <SmallIcon
                  Icon={X}
                  label="Cancel archive"
                  disabled={busy}
                  onPress={() => setArchiving(undefined)}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>
      {query.hasNextPage ? (
        <SetupButton
          secondary
          label="More rules"
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
      {/* One line to add (or edit) a rule; new rules go to the end of the list. */}
      {allowed && !archiving ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TextInput
            accessibilityLabel="Rule text"
            placeholder={editing ? 'Edit rule' : 'Add a rule'}
            placeholderTextColor={mobileColors.secondary}
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={4000}
            editable={!busy}
            className="min-h-12 flex-1 rounded-input border border-border bg-inputSurface px-3 py-2 text-text"
          />
          <SmallIcon
            Icon={editing ? Check : Plus}
            label={editing ? 'Save rule' : 'Add rule'}
            filled
            disabled={busy || !body.trim()}
            onPress={() => {
              if (!editing) setOrder(String(rows.length));
              void save(editing ? undefined : rows.length).catch(() => undefined);
            }}
          />
          {editing ? (
            <SmallIcon
              Icon={X}
              label="Cancel edit"
              disabled={busy}
              onPress={() => {
                setEditing(undefined);
                setBody('');
                setOrder('0');
              }}
            />
          ) : null}
        </View>
      ) : null}
      {failure ? <SetupText alert>{safeMessage(failure)}</SetupText> : null}
      {command.unresolved && !command.isPending ? (
        <SetupButton label="Retry previous rule change" onPress={() => command.retryOriginal()} />
      ) : null}
    </SetupCard>
  );
}

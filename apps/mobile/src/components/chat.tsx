import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, MessageCircle } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { listBranchConversations, listOwnConversations } from '@hsm/api-client';
import type { z } from 'zod';
import type { conversationSchema } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { chatTime } from '../lib/karachi-time';
import { Button, Copy } from './ui';
import { ChatThread } from './chat-thread';
type Props = {
  actorId: string;
  branchId?: string;
  accessUnavailable?: boolean;
  initialConversationId?: string;
  // Kept for callers; the inbox now always opens straight away.
  standalone?: boolean;
};
type Row = z.infer<typeof conversationSchema>;
export function Chat(props: Props) {
  return <Workspace key={props.actorId + ':' + (props.branchId ?? 'own')} {...props} />;
}
// COMM-001: the inbox opens at once. A conversation opens on its own with Back.
function Workspace({ actorId, branchId, accessUnavailable = false, initialConversationId }: Props) {
  const [selected, setSelected] = useState(initialConversationId),
    [cursor, setCursor] = useState<string>(),
    [busy, setBusy] = useState(false);
  const query = useQuery({
    queryKey: ['chat', actorId, branchId ?? 'own', 'conversations', cursor],
    gcTime: 0,
    retry: false,
    enabled: !accessUnavailable,
    queryFn: async () => {
      const client = await actorClient(actorId);
      return branchId
        ? listBranchConversations(client, branchId, cursor ? { cursor } : {})
        : listOwnConversations(client, actorId, cursor ? { cursor } : {});
    },
  });
  const unavailable = accessUnavailable || query.isError;
  const name = (row: Row) => (branchId ? row.customerName : row.branchName);
  if (selected) {
    const row = query.data?.data.find((value) => value.id === selected);
    return (
      <ChatThread
        key={selected}
        actorId={actorId}
        conversationId={selected}
        title={row ? name(row) : 'Messages'}
        {...(branchId ? { branchId } : {})}
        accessUnavailable={unavailable || query.isPending}
        onBusy={setBusy}
        onBack={() => {
          if (!busy) setSelected(undefined);
        }}
      />
    );
  }
  if (unavailable)
    return (
      <Copy alert>
        {accessUnavailable ? 'Pull down to load branch access.' : safeMessage(query.error)}
      </Copy>
    );
  if (query.isPending) return <Skeleton kind="chat" label="Loading conversations…" />;
  return (
    <View className="gap-3" accessibilityLabel="Messages">
      {!query.data.data.length ? <EmptyInbox staff={Boolean(branchId)} /> : null}
      {query.data.data.map((row) => (
        <ConversationRow
          key={row.id}
          name={name(row)}
          row={row}
          onPress={() => setSelected(row.id)}
        />
      ))}
      {query.data.nextCursor ? (
        <Button
          secondary
          label="More conversations"
          onPress={() => setCursor(query.data.nextCursor ?? undefined)}
        />
      ) : null}
      {cursor ? (
        <Button secondary label="First conversation page" onPress={() => setCursor(undefined)} />
      ) : null}
    </View>
  );
}
function ConversationRow(props: { name: string; row: Row; onPress: () => void }) {
  const { row } = props;
  const when = row.lastMessageAt ?? row.createdAt;
  const unread = row.unreadCount;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.name + (unread ? ', ' + unread + ' unread' : '')}
      onPress={props.onPress}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View style={[styles.card, unread ? styles.unreadCard : null]}>
        <View style={styles.avatar}>
          <Text className="font-heading" style={styles.initial}>
            {props.name.trim().charAt(0).toUpperCase() || '?'}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text className="font-heading" numberOfLines={1} style={styles.name}>
            {props.name}
          </Text>
          <Text className="font-body" style={styles.time}>
            {chatTime(when)}
          </Text>
        </View>
        {unread ? (
          <View style={styles.badge}>
            <Text className="font-heading" style={styles.badgeText}>
              {unread > 99 ? '99+' : unread}
            </Text>
          </View>
        ) : (
          <ChevronRight size={22} color={c.primary} />
        )}
      </View>
    </Pressable>
  );
}
function EmptyInbox({ staff }: { staff: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: 36 }}>
      <View style={[styles.avatar, { width: 72, height: 72, borderRadius: 36 }]}>
        <MessageCircle size={36} color={c.primary} />
      </View>
      <Text className="font-heading" style={{ color: c.heading, fontSize: 17 }}>
        No messages yet
      </Text>
      {!staff ? (
        <Text className="font-body" style={{ color: c.secondary, fontSize: 14 }}>
          Message a hostel from its page
        </Text>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
  },
  unreadCard: { borderColor: c.primary, borderWidth: 1.5 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.icy,
  },
  initial: { color: c.primary, fontSize: 22, fontWeight: '800' },
  name: { color: c.heading, fontSize: 17, fontWeight: '700' },
  time: { color: c.secondary, fontSize: 13 },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.primary,
  },
  badgeText: { color: c.surface, fontSize: 14, fontWeight: '800' },
});

import { mobileSurfaces } from '@hsm/ui';
import { Skeleton } from './loading/skeleton';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, CheckCheck } from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { safeMessage } from '../lib/messages';
import { useInbox } from './use-inbox';
import { SetupButton, SetupCard, SetupText, StatusChip } from './owner-wizard-ui';
const when = (value: string) =>
  new Date(value).toLocaleString('en-PK', {
    timeZone: 'Asia/Karachi',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
// Owner inbox in the Owner design: unread items are marked and can be marked read one by one.
export function OwnerNotificationsList({ actorId }: { actorId: string }) {
  const { query, mark } = useInbox(actorId);
  if (query.isPending) return <Skeleton kind="list" label="Loading notifications…" />;
  if (query.isError)
    return (
      <SetupCard>
        <SetupText alert>{safeMessage(query.error)}</SetupText>
      </SetupCard>
    );
  const notices = query.data.pages.flatMap((page) => page.data);
  const unread = query.data.pages[0]?.unreadCount ?? 0;
  return (
    <>
      <StatusChip
        label={unread ? unread + ' unread' : 'All caught up'}
        tone={unread ? 'info' : 'success'}
      />
      {!notices.length ? (
        <SetupCard>
          <SetupText muted>No notifications yet</SetupText>
        </SetupCard>
      ) : null}
      {mark.isError ? <SetupText alert>{safeMessage(mark.error)}</SetupText> : null}
      {notices.map((notice) => (
        <View key={notice.id} style={[styles.card, !notice.readAt && styles.unread]}>
          <View style={styles.head}>
            {!notice.readAt ? <View style={styles.dot} accessibilityLabel="Unread" /> : null}
            <Text className="font-heading" style={styles.title}>
              {notice.title}
            </Text>
          </View>
          <SetupText>{notice.body}</SetupText>
          <View style={styles.foot}>
            <SetupText muted>{when(notice.createdAt)}</SetupText>
            {notice.readAt ? (
              <CheckCheck size={m.stepIcon} color={c.secondary} accessibilityLabel="Read" />
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Mark as read"
                accessibilityState={{ disabled: mark.isPending }}
                disabled={mark.isPending}
                onPress={() => mark.mutate(notice.id)}
                style={styles.mark}
              >
                <Check size={m.stepIcon - 4} color={c.primary} />
                <Text className="font-heading" style={styles.markText}>
                  Mark read
                </Text>
              </Pressable>
            )}
          </View>
        </View>
      ))}
      {query.hasNextPage ? (
        <SetupButton
          secondary
          label={query.isFetchingNextPage ? 'Loading…' : 'More notifications'}
          disabled={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
        />
      ) : null}
    </>
  );
}
const styles = StyleSheet.create({
  card: {
    ...mobileSurfaces.icyCard,
    backgroundColor: mobileSurfaces.icyCard.backgroundColor,
    borderRadius: m.cardRadius,
    borderWidth: 1,
    borderColor: mobileSurfaces.icyCard.borderColor,
    padding: m.gap,
    gap: m.smallGap,
  },
  unread: { borderColor: c.primary },
  head: { flexDirection: 'row', alignItems: 'center', gap: m.smallGap },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.primary },
  title: { color: c.heading, fontSize: m.body + 1, flex: 1 },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: m.smallGap,
  },
  mark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: m.touch - 8,
    paddingHorizontal: m.smallGap + 4,
    borderRadius: m.touch,
    borderWidth: 1,
    borderColor: c.border,
  },
  markText: { color: c.primary, fontSize: m.small + 1 },
});

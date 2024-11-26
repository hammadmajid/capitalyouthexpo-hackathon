import { Skeleton } from './loading/skeleton';
import { Check, Circle } from 'lucide-react-native';
import { mobileColors, mobileSurfaces } from '@hsm/ui';
import { Pressable, Text, View } from 'react-native';
import { useInbox } from './use-inbox';
import { Button, Copy } from './ui';
import { karachiDateTime } from '../lib/karachi-time';
import { safeMessage } from '../lib/messages';
export function Inbox({
  actorId,
  hideHeading = false,
  onWaitlist,
  onMessages,
  onVisits,
  onVisitSpace,
}: {
  actorId: string;
  hideHeading?: boolean;
  onWaitlist?: () => void;
  onMessages?: () => void;
  onVisits?: () => void;
  onVisitSpace?: () => void;
}) {
  const { query, mark } = useInbox(actorId);
  if (query.isPending) return <Skeleton kind="list" label="Loading notifications…" />;
  if (query.isError)
    return (
      <View className="gap-3">
        <Copy alert>{safeMessage(query.error)}</Copy>
      </View>
    );
  const notices = query.data.pages.flatMap((page) => page.data);
  const unreadCount = query.data.pages[0]?.unreadCount;
  return (
    <View className="gap-4">
      {!hideHeading ? (
        <Text accessibilityRole="header" className="font-heading text-body text-text">
          Notifications
        </Text>
      ) : null}
      {unreadCount ? <Copy>{unreadCount} unread</Copy> : null}
      {notices.length === 0 ? <Copy>No notifications yet.</Copy> : null}
      {mark.isError ? <Copy alert>{safeMessage(mark.error)}</Copy> : null}
      {notices.map((notice) => (
        <View
          key={notice.id}
          style={mobileSurfaces.icyCard}
          className="rounded-card border border-cardBorder p-4 gap-2"
        >
          <View className="flex-row items-center gap-2">
            {!notice.readAt ? (
              <Circle
                size={8}
                color={mobileColors.primary}
                fill={mobileColors.primary}
                accessibilityLabel="Unread"
              />
            ) : null}
            <Text className="flex-1 font-heading text-body text-text">{notice.title}</Text>
            {!notice.readAt ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: mark.isPending }}
                className="min-h-12 min-w-12 items-center justify-center rounded-full bg-icy"
                accessibilityLabel="Mark as read"
                disabled={mark.isPending}
                onPress={() => mark.mutate(notice.id)}
              >
                <Check size={20} color={mobileColors.primary} />
              </Pressable>
            ) : null}
          </View>
          <Copy>{notice.body}</Copy>
          {notice.type === 'waitlist.vacancy' && onWaitlist ? (
            <Button secondary label="Open my waiting list" onPress={onWaitlist} />
          ) : null}
          {notice.type === 'chat.message.created' && onMessages ? (
            <Button secondary label="Open your message space" onPress={onMessages} />
          ) : null}
          {notice.type === 'visit.follow_up' && onVisits ? (
            <Button secondary label="Open my visits" onPress={onVisits} />
          ) : null}
          {notice.type === 'visit.changed' && onVisitSpace ? (
            <Button secondary label="Open your visit space" onPress={onVisitSpace} />
          ) : null}
          <Copy>{karachiDateTime(notice.createdAt)}</Copy>
        </View>
      ))}
      {query.hasNextPage ? (
        <Button
          secondary
          label={query.isFetchingNextPage ? 'Loading more notifications…' : 'More notifications'}
          disabled={query.isFetchingNextPage}
          onPress={() => {
            void query.fetchNextPage();
          }}
        />
      ) : null}
    </View>
  );
}

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Flag } from 'lucide-react-native';
import type { z } from 'zod';
import type { chatMessageSchema } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { chatTime } from '../lib/karachi-time';
import { ChatAttachment } from './chat-attachment';
type Row = z.infer<typeof chatMessageSchema>;
// COMM-001: one message as a bubble — mine on the right in green, theirs on the left.
// Only the other side's messages can be reported (COMM-002), from a small flag.
export function ChatBubble(props: {
  row: Row;
  mine: boolean;
  actorId: string;
  conversationId: string;
  branchId?: string;
  reportDisabled: boolean;
  onReport: () => void;
}) {
  const { row, mine } = props;
  const time = chatTime(row.createdAt);
  return (
    <View
      style={[styles.line, mine ? styles.mineLine : null]}
      accessible={false}
      accessibilityLabel={(mine ? 'You' : row.senderName) + ', ' + time}
    >
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        {!mine ? (
          <Text className="font-heading" numberOfLines={1} style={styles.sender}>
            {row.senderName}
          </Text>
        ) : null}
        {row.body ? (
          <Text className="font-body" style={[styles.body, mine && { color: c.surface }]}>
            {row.body}
          </Text>
        ) : null}
        {row.attachmentFileIds.map((fileId) => (
          <ChatAttachment
            key={fileId}
            actorId={props.actorId}
            conversationId={props.conversationId}
            fileId={fileId}
            mine={mine}
            {...(props.branchId ? { branchId: props.branchId } : {})}
          />
        ))}
        <Text className="font-body" style={[styles.time, mine && { color: c.icy }]}>
          {time}
        </Text>
      </View>
      {!mine ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Report this message"
          disabled={props.reportDisabled}
          hitSlop={8}
          onPress={props.onReport}
          style={({ pressed }) => [
            styles.flag,
            (pressed || props.reportDisabled) && { opacity: 0.5 },
          ]}
        >
          <Flag size={16} color={c.secondary} />
        </Pressable>
      ) : null}
    </View>
  );
}
const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  mineLine: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '80%', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  mine: { backgroundColor: c.primary, borderBottomRightRadius: 6 },
  theirs: { ...mobileSurfaces.icyCard, borderWidth: 1, borderBottomLeftRadius: 6 },
  sender: { color: c.primary, fontSize: 13, fontWeight: '700' },
  body: { color: c.heading, fontSize: 16, lineHeight: 22 },
  time: { alignSelf: 'flex-end', color: c.secondary, fontSize: 11 },
  flag: { padding: 4 },
});

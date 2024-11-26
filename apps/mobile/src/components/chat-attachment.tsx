import { useMutation } from '@tanstack/react-query';
import { ActivityIndicator, Linking, Pressable, Text, View } from 'react-native';
import { Paperclip } from 'lucide-react-native';
import { downloadChatAttachment } from '@hsm/api-client';
import { mobileColors as c } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
// COMM-002: a checked private file inside a bubble; tap opens a short-lived signed link.
export function ChatAttachment({
  actorId,
  conversationId,
  fileId,
  branchId,
  mine = false,
}: {
  actorId: string;
  conversationId: string;
  fileId: string;
  branchId?: string;
  mine?: boolean;
}) {
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: async () => {
      const result = await downloadChatAttachment(
        await actorClient(actorId),
        conversationId,
        fileId,
        branchId,
      );
      await Linking.openURL(result.url);
    },
  });
  const tint = mine ? c.surface : c.primary;
  return (
    <View style={{ gap: 4 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open private attachment"
        disabled={mutation.isPending}
        onPress={() => mutation.mutate()}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          borderRadius: 14,
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: mine ? 'rgba(255,255,255,0.16)' : c.icy,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        {mutation.isPending ? (
          <ActivityIndicator size="small" color={tint} />
        ) : (
          <Paperclip size={18} color={tint} />
        )}
        <Text className="font-heading" style={{ color: tint, fontSize: 14 }}>
          File
        </Text>
      </Pressable>
      {mutation.error ? <Copy alert>{safeMessage(mutation.error)}</Copy> : null}
    </View>
  );
}

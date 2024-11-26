import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Paperclip, SendHorizontal, X } from 'lucide-react-native';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { PrivateFilePicker } from './private-file-picker';
// The picker's button drawn as a round paperclip (COMM-002 file checks are unchanged).
function AttachButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: Boolean(props.disabled) }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.round,
        styles.soft,
        (pressed || props.disabled) && styles.dim,
      ]}
    >
      <Paperclip size={22} color={c.primary} />
    </Pressable>
  );
}
function Chip(props: {
  label: string;
  text: string;
  busy?: boolean;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.chip}>
      {props.busy ? (
        <ActivityIndicator size="small" color={c.primary} />
      ) : (
        <Paperclip size={16} color={c.primary} />
      )}
      <Text className="font-heading" style={styles.chipText}>
        {props.text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label}
        disabled={props.disabled}
        hitSlop={8}
        onPress={props.onRemove}
      >
        <X size={16} color={c.secondary} />
      </Pressable>
    </View>
  );
}
// COMM-001: one bar — attach, type, send. Files wait for a clean scan before Send turns on.
export function ChatComposer(props: {
  actorId: string;
  body: string;
  onBody: (value: string) => void;
  attachmentIds: string[];
  onAttachments: (ids: string[]) => void;
  uploadPending: boolean;
  onUploadPending: (pending: boolean) => void;
  uploadRevision: number;
  onUploadRevision: () => void;
  onUploadBusy: (busy: boolean) => void;
  uploadBusy: boolean;
  locked: boolean;
  hidden: boolean;
  onSend: () => void;
}) {
  const canSend =
    !props.locked &&
    !props.uploadBusy &&
    !props.uploadPending &&
    !props.hidden &&
    Boolean(props.body.trim() || props.attachmentIds.length);
  return (
    <View style={{ gap: 8 }}>
      {props.uploadPending || props.attachmentIds.length ? (
        <View style={styles.chips}>
          {props.attachmentIds.map((fileId, index) => (
            <Chip
              key={fileId}
              text={'File ' + (index + 1)}
              label={'Remove attachment ' + (index + 1)}
              disabled={props.locked || props.uploadBusy || props.hidden}
              onRemove={() =>
                props.onAttachments(props.attachmentIds.filter((id) => id !== fileId))
              }
            />
          ))}
          {props.uploadPending ? (
            <Chip
              busy
              text="File"
              label="Discard pending attachment"
              disabled={props.locked || props.uploadBusy}
              onRemove={() => {
                props.onUploadPending(false);
                props.onUploadRevision();
              }}
            />
          ) : null}
        </View>
      ) : null}
      <View style={styles.bar}>
        <PrivateFilePicker
          retainSelection={false}
          key={props.uploadRevision}
          actorId={props.actorId}
          label="message attachment"
          purpose="chat_attachment"
          hideLabel
          hideHint
          Action={AttachButton}
          disabled={props.locked || props.hidden || props.attachmentIds.length >= 5}
          onBusy={props.onUploadBusy}
          onPending={props.onUploadPending}
          onReady={(fileId) => {
            if (fileId) {
              props.onAttachments([...new Set([...props.attachmentIds, fileId])]);
              props.onUploadRevision();
            }
          }}
        />
        <TextInput
          accessibilityLabel="Message"
          placeholder="Message"
          placeholderTextColor={c.placeholder}
          multiline
          maxLength={4000}
          value={props.body}
          editable={!props.locked && !props.uploadBusy && !props.hidden}
          onChangeText={props.onBody}
          className="font-body"
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send message"
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={props.onSend}
          style={({ pressed }) => [styles.round, styles.send, (pressed || !canSend) && styles.dim]}
        >
          {props.locked ? (
            <ActivityIndicator size="small" color={c.surface} />
          ) : (
            <SendHorizontal size={22} color={c.surface} />
          )}
        </Pressable>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  round: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soft: { ...mobileSurfaces.icyCard, borderWidth: 1 },
  send: { backgroundColor: c.primary },
  dim: { opacity: 0.45 },
  input: {
    ...mobileSurfaces.input,
    flex: 1,
    minHeight: 48,
    maxHeight: 140,
    borderWidth: 1,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 13,
    paddingBottom: 13,
    color: c.heading,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    ...mobileSurfaces.icyCard,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: c.heading, fontSize: 13 },
});

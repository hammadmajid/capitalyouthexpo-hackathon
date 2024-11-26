import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react-native';
import { mobileOwnerColors as c, ownerMetrics as m } from '@hsm/ui';
import { AppHeader } from './navigation/header';
import { BedAdmission, useAdmissionAllowed } from './bed-admission';
import { NativeBedDetail } from './bed-detail';
import { bedTone, type BoardRoom } from './bed-board-model';
import { bedShortLabel } from './bed-board-parts';
// Side panel from this window width (tablet/desktop); a bottom sheet below it.
export const sidePanelWidth = 900;
// CHG-048 / BED-002: one place for a tapped bed. A vacant bed opens Add Resident with the
// bed already chosen; any other bed opens its details (resident, rent, proofs, history).
// Closing refreshes the board so colours follow the new server state.
export function BedSheet(props: {
  actorId: string;
  branchId: string;
  room: BoardRoom;
  bed: BoardRoom['beds'][number];
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const side = width >= sidePanelWidth;
  const cache = useQueryClient();
  const close = () => {
    void cache.invalidateQueries({ queryKey: ['bed-board', props.actorId, props.branchId] });
    props.onClose();
  };
  return (
    <Modal
      transparent
      visible
      animationType={side ? 'fade' : 'slide'}
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, side ? styles.backdropSide : styles.backdropBottom]}>
        <Pressable accessibilityLabel="Close bed" style={StyleSheet.absoluteFill} onPress={close} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={side ? styles.side : styles.sheet}
        >
          {side ? null : <View style={styles.handle} accessibilityElementsHidden />}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.content}
            accessibilityLabel={'Room ' + props.room.label + ' bed ' + props.bed.label}
          >
            <SheetBody {...props} close={close} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
function SheetBody(props: {
  actorId: string;
  branchId: string;
  room: BoardRoom;
  bed: BoardRoom['beds'][number];
  close: () => void;
}) {
  const canAdmit = useAdmissionAllowed(props.actorId, props.branchId);
  const vacant = bedTone(props.bed) === 'vacant';
  const [details, setDetails] = useState(!vacant);
  const title = 'Room ' + props.room.label + ' · ' + bedShortLabel(props.bed);
  if (vacant && canAdmit && !details)
    return (
      <View style={{ gap: m.gap }}>
        <AppHeader
          title={'Add resident · ' + title}
          backLabel="Close add resident"
          onBack={props.close}
        />
        <BedAdmission
          actorId={props.actorId}
          branchId={props.branchId}
          bedId={props.bed.id}
          initialOpen
          hideHeader
          onClose={props.close}
        />
        {/* Less used: a small link at the end instead of a big tile above the form. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Bed details and history"
          onPress={() => setDetails(true)}
          style={styles.link}
        >
          <Info size={20} color={c.primary} />
          <Text className="font-heading" numberOfLines={1} style={styles.linkText}>
            Bed details and history
          </Text>
        </Pressable>
      </View>
    );
  return (
    <NativeBedDetail
      actorId={props.actorId}
      branchId={props.branchId}
      bedId={props.bed.id}
      on=""
      title={title}
      close={vacant && canAdmit ? () => setDetails(false) : props.close}
    />
  );
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(16,59,48,0.38)' },
  backdropBottom: { justifyContent: 'flex-end' },
  backdropSide: { flexDirection: 'row', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '92%',
    minHeight: '55%',
    backgroundColor: c.background,
    borderTopLeftRadius: m.cardRadius + 6,
    borderTopRightRadius: m.cardRadius + 6,
    boxShadow: '0px -6px 24px rgba(0,77,56,0.18)',
  },
  side: {
    width: 460,
    maxWidth: '100%',
    height: '100%',
    backgroundColor: c.background,
    boxShadow: '-6px 0px 24px rgba(0,77,56,0.18)',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.border,
    marginTop: 10,
  },
  content: { padding: m.page, paddingBottom: m.page * 2, gap: m.gap },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: m.touch,
  },
  linkText: { color: c.primary, fontSize: m.body, fontWeight: '700' },
});

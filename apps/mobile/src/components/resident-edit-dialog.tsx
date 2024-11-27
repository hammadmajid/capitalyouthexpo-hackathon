import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, View } from 'react-native';
import { mobileColors as c } from '@hsm/ui';
import { ResidentEdit } from './resident-edit';
import { residentStyles as s } from './resident-detail-ui';
export function ResidentEditDialog(props: ComponentProps<typeof ResidentEdit>) {
  const [pending, setPending] = useState(false);
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!pending) props.onClose();
      }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: c.deep + '66' }}
      >
        <View
          accessibilityViewIsModal
          accessibilityLabel="Edit resident dialog"
          style={[
            s.card,
            {
              alignSelf: 'center',
              width: '100%',
              maxWidth: 520,
              maxHeight: '85%',
              backgroundColor: c.background,
              padding: 14,
            },
          ]}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 4 }}
          >
            <ResidentEdit {...props} onPendingChange={setPending} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

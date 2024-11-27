import type { Dispatch, SetStateAction } from 'react';
import { Switch, Text, View } from 'react-native';
import { Camera, CircleCheck } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { PrivateFilePicker } from './private-file-picker';
export type StaffPaymentProofState = {
  attached: boolean;
  busy: boolean;
  fileId: string | undefined;
};
export function StaffPaymentProof({
  actorId,
  value,
  onChange,
}: {
  actorId: string;
  value: StaffPaymentProofState;
  onChange: Dispatch<SetStateAction<StaffPaymentProofState>>;
}) {
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2">
        <Camera size={20} color={colors.primary} />
        <Text className="flex-1 font-heading text-body text-heading">Proof</Text>
        <Switch
          accessibilityLabel="Attach a private proof (optional)"
          accessibilityRole="switch"
          value={value.attached}
          disabled={value.busy}
          onValueChange={(attached) =>
            onChange((current) => ({ ...current, attached, fileId: undefined }))
          }
        />
      </View>
      {value.attached ? (
        <PrivateFilePicker
          actorId={actorId}
          label="proof"
          hideLabel
          hideHint
          purpose="payment_proof"
          onReady={(fileId) => onChange((current) => ({ ...current, fileId }))}
          onBusy={(busy) => onChange((current) => ({ ...current, busy }))}
        />
      ) : null}
      {value.attached && value.fileId ? (
        <View className="flex-row items-center gap-2">
          <CircleCheck size={18} color={colors.primary} />
          <Text className="font-body text-sm text-primary">Attached</Text>
        </View>
      ) : null}
    </View>
  );
}

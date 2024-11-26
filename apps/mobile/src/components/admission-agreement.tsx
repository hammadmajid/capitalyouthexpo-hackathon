import type { ComponentProps } from 'react';
import { Text, View } from 'react-native';
import { Camera, CircleCheck, FileText } from 'lucide-react-native';
import { attachAgreementFile, type AgreementDocumentTarget } from '@hsm/api-client';
import { mobileColors as colors } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
import { IconChip } from './inventory-tools';
import { PriceSection } from './price-form-parts';
import { PrivateFilePicker } from './private-file-picker';
import type { Button } from './ui';
function PhotoChip(props: ComponentProps<typeof Button>) {
  return (
    <IconChip
      Icon={Camera}
      text="Add photo"
      label={props.label}
      disabled={props.disabled ?? false}
      onPress={props.onPress}
    />
  );
}
// STAY-002: the signed agreement photo is uploaded privately (scanned before use) and attached
// to the new Stay's agreement right after admission succeeds.
export function AdmissionAgreement(props: {
  actorId: string;
  fileId: string | undefined;
  disabled: boolean;
  onBusy: (busy: boolean) => void;
  onReady: (fileId: string | undefined) => void;
}) {
  return (
    <PriceSection Icon={FileText} title="Agreement" note="Photo of the signed agreement">
      {props.fileId ? (
        <View className="flex-row items-center gap-2">
          <CircleCheck size={18} color={colors.success} />
          <Text className="font-body text-sm text-text">Photo ready · saved with the resident</Text>
        </View>
      ) : null}
      <View style={{ alignSelf: 'flex-start' }}>
        <PrivateFilePicker
          label="agreement photo"
          hideLabel
          hideHint
          purpose="stay_agreement"
          actorId={props.actorId}
          Action={PhotoChip}
          disabled={props.disabled}
          onBusy={props.onBusy}
          onReady={props.onReady}
        />
      </View>
    </PriceSection>
  );
}
export async function attachAdmissionAgreement(
  actorId: string,
  target: AgreementDocumentTarget,
  fileId: string,
  key: string,
) {
  return attachAgreementFile(
    await actorClient(actorId),
    target,
    { fileId, label: 'Signed agreement' },
    key,
  );
}

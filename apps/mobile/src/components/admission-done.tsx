import { useState } from 'react';
import { Text, View } from 'react-native';
import { CircleCheck, FileText, Receipt } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { BedActionTile } from './bed-action-tile';
import { StaffStayWorkspace } from './staff-stay-workspace';
import { AppHeader } from './navigation/header';
// STAY-001 next steps: the agreement photo and the first rent live on the new Stay. Rent shows
// as due until an approved payment record with a receipt exists (never "Paid" from a photo).
export function AdmissionDone(props: {
  actorId: string;
  branchId: string;
  stayId: string;
  agreementSaved?: boolean | undefined;
  close: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <StaffStayWorkspace
        actorId={props.actorId}
        branchId={props.branchId}
        stayId={props.stayId}
        onClose={() => setOpen(false)}
      />
    );
  return (
    <View className="gap-3">
      <AppHeader title="Add resident" backLabel="Done" onBack={props.close} />
      <View className="flex-row items-center gap-2">
        <CircleCheck size={24} color={colors.success} />
        <Text className="flex-1 font-heading text-body text-heading">
          Resident admitted. The Stay is active.
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <BedActionTile
          Icon={FileText}
          title="Agreement"
          detail={
            props.agreementSaved
              ? 'Photo saved'
              : props.agreementSaved === false
                ? 'Photo not saved · add again'
                : 'Add photo'
          }
          label="Add agreement photo"
          onPress={() => setOpen(true)}
        />
        <BedActionTile
          Icon={Receipt}
          title="First rent"
          detail="Due · record payment"
          label="First rent and payments"
          onPress={() => setOpen(true)}
        />
      </View>
    </View>
  );
}

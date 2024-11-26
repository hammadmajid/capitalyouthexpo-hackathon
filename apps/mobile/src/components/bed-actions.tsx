import { useState } from 'react';
import { View } from 'react-native';
import { UserPlus } from 'lucide-react-native';
import { BedActionTile } from './bed-action-tile';
import { BedAdmission, useAdmissionAllowed } from './bed-admission';
import { BedTurnOn } from './bed-turn-on';
// Add a resident to this bed; rent is set from the room screen's Rent card. An off bed first
// offers to turn it on; an occupied, reserved or blocked bed cannot take a resident (ACC-001).
export function BedActions(props: {
  actorId: string;
  branchId: string;
  bedId: string;
  roomId: string;
  bedOff: boolean;
  roomOn: boolean;
  blockedReason?: string | undefined;
  onPanel?: ((open: boolean) => void) | undefined;
}) {
  const [panel, setPanelState] = useState<'admit' | 'turn-on'>();
  const setPanel = (value: 'admit' | 'turn-on' | undefined) => {
    setPanelState(value);
    props.onPanel?.(value !== undefined);
  };
  const canAdmit = useAdmissionAllowed(props.actorId, props.branchId);
  if (!canAdmit) return null;
  if (panel === 'turn-on')
    return (
      <BedTurnOn
        actorId={props.actorId}
        branchId={props.branchId}
        roomId={props.roomId}
        bedId={props.bedId}
        roomOn={props.roomOn}
        onBack={() => setPanel(undefined)}
        onDone={() => setPanel('admit')}
      />
    );
  if (panel === 'admit')
    return (
      <BedAdmission
        actorId={props.actorId}
        branchId={props.branchId}
        bedId={props.bedId}
        initialOpen
        onClose={() => setPanel(undefined)}
      />
    );
  return (
    <View style={{ flexDirection: 'row' }}>
      <BedActionTile
        Icon={UserPlus}
        title="Add resident"
        detail={props.bedOff ? 'Bed is off · tap to turn on' : props.blockedReason}
        label="Add resident"
        disabled={!props.bedOff && Boolean(props.blockedReason)}
        onPress={() => setPanel(props.bedOff ? 'turn-on' : 'admit')}
      />
    </View>
  );
}

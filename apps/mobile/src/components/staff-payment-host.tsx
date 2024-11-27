import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { StaffStayPayment } from './staff-stay-payment';
type Props = {
  actorId: string;
  branchId?: string;
  unavailable: boolean;
  children: (onRecord: (id: string) => void) => ReactNode;
};
export function StaffPaymentHost({ actorId, branchId, unavailable, children }: Props) {
  const [stayId, setStayId] = useState<string>();
  function start(id: string) {
    if (branchId && !stayId && !unavailable) setStayId(id);
  }
  return (
    <>
      {/* The payment form replaces the screen (one Back); the screen stays mounted so the
          open section is still there when the form closes. */}
      <View
        style={stayId ? { display: 'none' } : undefined}
        pointerEvents={stayId ? 'none' : 'auto'}
        accessibilityElementsHidden={Boolean(stayId)}
        importantForAccessibility={stayId ? 'no-hide-descendants' : 'auto'}
      >
        {children(start)}
      </View>
      {branchId && stayId ? (
        <StaffStayPayment
          actorId={actorId}
          branchId={branchId}
          stayId={stayId}
          unavailable={unavailable}
          onClose={() => setStayId(undefined)}
        />
      ) : null}
    </>
  );
}

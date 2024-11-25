'use client';
import { useState, type ReactNode } from 'react';
import { StaffStayPayment } from './staff-stay-payment';
type Props = {
  actorId: string;
  branchId?: string;
  unavailable: boolean;
  children: (onRecord: (stayId: string) => void) => ReactNode;
};
// ACC-004: keep a submitted/unknown command outside refreshing Stay detail renders.
export function StaffPaymentHost({ actorId, branchId, unavailable, children }: Props) {
  const [stayId, setStayId] = useState<string>();
  function start(id: string) {
    if (branchId && !stayId && !unavailable) setStayId(id);
  }
  return (
    <>
      <fieldset disabled={Boolean(stayId)}>{children(start)}</fieldset>
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

'use client';
import { useState, type ReactNode } from 'react';
import { OwnStayNotice } from './own-stay-notice';
type Props = {
  actorId: string;
  branchId?: string;
  unavailable: boolean;
  children: (onNotice: (stayId: string) => void) => ReactNode;
};
// OUT-001 / ACC-004: the command lives outside conditional list/detail renders.
export function OwnNoticeHost({ actorId, branchId, unavailable, children }: Props) {
  const [stayId, setStayId] = useState<string>();
  function start(id: string) {
    if (!branchId && !stayId && !unavailable) setStayId(id);
  }
  return (
    <>
      <fieldset disabled={Boolean(stayId)}>{children(start)}</fieldset>
      {!branchId && stayId ? (
        <OwnStayNotice
          actorId={actorId}
          stayId={stayId}
          unavailable={unavailable}
          onClose={() => setStayId(undefined)}
        />
      ) : null}
    </>
  );
}

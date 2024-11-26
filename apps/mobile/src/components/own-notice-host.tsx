import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { OwnStayNotice } from './own-stay-notice';
type Props = {
  actorId: string;
  branchId?: string;
  unavailable: boolean;
  children: (onNotice: (stayId: string) => void) => ReactNode;
};
// OUT-001 / ACC-004: preserve the original command when list/detail reads refresh.
export function OwnNoticeHost({ actorId, branchId, unavailable, children }: Props) {
  const [stayId, setStayId] = useState<string>();
  function start(id: string) {
    if (!branchId && !stayId && !unavailable) setStayId(id);
  }
  return (
    <View>
      <View
        pointerEvents={stayId ? 'none' : 'auto'}
        accessibilityElementsHidden={Boolean(stayId)}
        importantForAccessibility={stayId ? 'no-hide-descendants' : 'auto'}
      >
        {children(start)}
      </View>
      {!branchId && stayId ? (
        <OwnStayNotice
          actorId={actorId}
          stayId={stayId}
          unavailable={unavailable}
          onClose={() => setStayId(undefined)}
        />
      ) : null}
    </View>
  );
}

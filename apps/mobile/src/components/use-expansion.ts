import { useEffect, useState } from 'react';
import { AccessibilityInfo, LayoutAnimation } from 'react-native';
// Shared room/building expansion respects the device's motion preference.
export function useExpansion() {
  const [expanded, setExpanded] = useState(false),
    [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    const preference = AccessibilityInfo.isReduceMotionEnabled?.();
    void preference
      ?.then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => undefined);
    const listener = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      listener?.remove();
    };
  }, []);
  return {
    expanded,
    toggle: () => {
      if (!reduced) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setExpanded((value) => !value);
    },
  };
}

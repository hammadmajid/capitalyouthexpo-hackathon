import { createContext, useContext, useEffect } from 'react';
export const OwnerScreenBack = createContext<
  ((back: () => void, priority: number) => () => void) | null
>(null);
// An inline workspace uses the screen's existing Back button, including Android Back.
export function useOwnerScreenBack(onBack: () => void, enabled = true, priority = 1) {
  const registerBack = useContext(OwnerScreenBack);
  useEffect(() => {
    if (!registerBack || !enabled) return;
    return registerBack(onBack, priority);
  }, [registerBack, onBack, enabled, priority]);
  return Boolean(registerBack);
}

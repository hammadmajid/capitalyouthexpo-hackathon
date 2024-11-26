import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
type Navigation = { locked: boolean; acquire: () => () => void };
const NavigationContext = createContext<Navigation | null>(null);
export function NativeInventoryNavigationProvider({ children }: { children: ReactNode }) {
  const inherited = useContext(NavigationContext);
  const [tokens, setTokens] = useState<Set<symbol>>(() => new Set());
  const acquire = useCallback(() => {
    const token = Symbol('inventory-settings');
    setTokens((current) => new Set([...current, token]));
    return () =>
      setTokens((current) => {
        const next = new Set(current);
        next.delete(token);
        return next;
      });
  }, []);
  const locked = tokens.size > 0;
  const value = useMemo(() => ({ locked, acquire }), [locked, acquire]);
  return inherited ? (
    <>{children}</>
  ) : (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}
export function useNativeInventoryNavigationLocked() {
  return useContext(NavigationContext)?.locked ?? false;
}
export function useNativeInventoryNavigationLock(busy: boolean) {
  const acquire = useContext(NavigationContext)?.acquire;
  useEffect(() => (busy ? acquire?.() : undefined), [busy, acquire]);
}

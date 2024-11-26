import { useState, type ReactNode } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { OwnerScreenBack } from './owner-screen-back';
import { router } from 'expo-router';
import { SetupShell } from './owner-wizard-ui';
// Standard Owner sub-screen: same shell as setup, Back returns to the previous Owner screen.
export function ownerBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/owner');
}
export function OwnerScreen({
  title,
  subtitle,
  children,
  back,
  dense = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  back?: () => void;
  dense?: boolean;
}) {
  const [backScopes, setBackScopes] = useState<
    { id: symbol; back: () => void; priority: number }[]
  >([]);
  const registerBack = useCallback((handler: () => void, priority: number) => {
    const scope = { id: Symbol('inline-back'), back: handler, priority };
    setBackScopes((previous) => [...previous, scope]);
    return () => setBackScopes((previous) => previous.filter((entry) => entry.id !== scope.id));
  }, []);
  const inlineBack = [...backScopes].sort((a, b) => a.priority - b.priority).at(-1)?.back;
  const goBack = inlineBack ?? back ?? ownerBack;
  useFocusEffect(
    useCallback(() => {
      if (!inlineBack) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        inlineBack();
        return true;
      });
      return () => subscription.remove();
    }, [inlineBack]),
  );
  return (
    <OwnerScreenBack.Provider value={registerBack}>
      <SetupShell compact dense={dense} title={title} subtitle={subtitle} back={goBack}>
        {children}
      </SetupShell>
    </OwnerScreenBack.Provider>
  );
}

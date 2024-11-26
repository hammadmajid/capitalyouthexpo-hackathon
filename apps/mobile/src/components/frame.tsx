import { NatureBackground } from './visual-surfaces';
import { PullScrollView } from './pull-refresh';
import { AppHeader, type HeaderSearchConfig } from './navigation/header';
import type { Href } from 'expo-router';
import type { ReactNode } from 'react';

import { SafeAreaView } from 'react-native-safe-area-context';
import { Skeleton } from './loading/skeleton';
export function Page({
  title,
  children,
  primary = false,
  search,
  backTo,
  onBack,
  backDisabled,
  actions,
  contentWidth,
}: {
  title: string;
  children: ReactNode;
  primary?: boolean;
  search?: HeaderSearchConfig;
  backTo?: Href;
  onBack?: () => void;
  backDisabled?: boolean;
  actions?: ReactNode;
  contentWidth?: number;
}) {
  return (
    <SafeAreaView className="flex-1 bg-background">
      <NatureBackground />
      <PullScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerClassName="px-6 py-6 gap-6"
        contentContainerStyle={
          contentWidth ? { width: '100%', maxWidth: contentWidth, alignSelf: 'center' } : undefined
        }
        automaticallyAdjustKeyboardInsets
      >
        <AppHeader
          title={title}
          actions={actions}
          showBack={!primary}
          {...(search ? { search } : {})}
          {...(backTo ? { backTo } : {})}
          {...(onBack ? { onBack } : {})}
          {...(backDisabled !== undefined ? { backDisabled } : {})}
        />
        {children}
      </PullScrollView>
    </SafeAreaView>
  );
}
export function Loading() {
  return (
    <SafeAreaView className="flex-1 bg-background p-6 gap-4">
      <NatureBackground />
      <Skeleton kind="dashboard" label="Restoring session" />
    </SafeAreaView>
  );
}

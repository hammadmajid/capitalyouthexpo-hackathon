import '../global.css';
import { useEffect } from 'react';
import { FailureBoundary } from '../components/failure-boundary';
import { initializeMobileTelemetry, reportMobileFailure } from '../observability/binding';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Providers, useSession } from '../components/providers';
import { Loading, Page } from '../components/frame';
import { Button, Copy } from '../components/ui';
import { safeMessage } from '../lib/messages';
function Navigation() {
  const session = useSession();
  if (session.cleanupError)
    return (
      <Page primary title="Sign-out incomplete">
        <Copy alert>Secure session cleanup failed. Unlock your device and try again.</Copy>
        <Button
          label="Retry sign out"
          onPress={() => {
            void session.retryCleanup().catch(() => undefined);
          }}
        />
      </Page>
    );
  if (session.isPending) return <Loading />;
  if (session.isError)
    return (
      <Page primary title="Could not load your account">
        <Copy alert>{safeMessage(session.error)}</Copy>
        <Button
          label="Try again"
          onPress={() => {
            void session.refetch();
          }}
        />
        <Button
          secondary
          label="Sign out"
          onPress={() => {
            void session.logout().catch(() => undefined);
          }}
        />
      </Page>
    );
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!session.profile}>
          <Stack.Screen name="index" />
          <Stack.Screen name="auth/[flow]" />
          <Stack.Screen name="guest" />
        </Stack.Protected>
        <Stack.Protected guard={Boolean(session.profile)}>
          <Stack.Screen name="authenticated-entry" />
          <Stack.Screen name="account" />
          <Stack.Screen name="account-options" />
          <Stack.Screen name="admin-invitation" />
          <Stack.Protected guard={Boolean(session.profile?.capabilities.admin)}>
            <Stack.Screen name="admin" />
          </Stack.Protected>
          <Stack.Screen name="marketplace" />
          <Stack.Screen name="customer-profile" />
          <Stack.Screen name="owner-profile" />
          <Stack.Screen name="owner" />
          <Stack.Screen name="owner-setup" />
          <Stack.Screen name="owner-invite" />
          <Stack.Screen name="owner-menu" />
          <Stack.Screen name="owner-verification" />
          <Stack.Screen name="owner-branch" />
          <Stack.Screen name="owner-notifications" />
          <Stack.Screen name="owner-help" />
          <Stack.Screen name="owner-reports" />
          <Stack.Screen name="owner-properties" />
          <Stack.Screen name="security" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
export default function RootLayout() {
  const [loaded, error] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_700Bold });
  useEffect(() => {
    initializeMobileTelemetry();
  }, []);
  useEffect(() => {
    if (error) reportMobileFailure();
  }, [error]);
  return (
    <SafeAreaProvider>
      <FailureBoundary>
        {error ? (
          <Page primary title="Unable to start">
            <Copy alert>Please restart the app.</Copy>
          </Page>
        ) : loaded ? (
          <Providers>
            <Navigation />
          </Providers>
        ) : (
          <Loading />
        )}
      </FailureBoundary>
    </SafeAreaProvider>
  );
}

import { startFinancialDaySync } from '../lib/financial-day-sync';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import { adminSignature } from '../lib/admin-access';
import { clearAdminCache } from '../lib/admin-cache';
import { forgetAdminMode } from '../lib/owner-mode';
import { sessions } from '../lib/runtime';
import type { MobileSession } from '../lib/vault';
import {
  restoredState,
  restoreFailureState,
  logoutFailureState,
  transientFailure,
  type SessionState,
} from '../lib/session-state';
function useLiveSession() {
  const cache = useQueryClient();
  const [state, setState] = useState<SessionState>({ phase: 'restoring' });
  const epoch = useRef(0);
  const blocked = useRef(false);
  const previous = useRef<import('@hsm/contracts').SelfProfile | undefined>(undefined);
  function reconcile(profile: import('@hsm/contracts').SelfProfile | undefined) {
    const old = previous.current;
    if (old?.user.id !== profile?.user.id) cache.clear();
    else if (adminSignature(old) !== adminSignature(profile)) clearAdminCache(cache);
    if (old?.capabilities.admin && !profile?.capabilities.admin) void forgetAdminMode(old.user.id);
    previous.current = profile;
  }
  async function refetch() {
    if (blocked.current) return undefined;
    const ticket = ++epoch.current;
    try {
      const profile = await sessions.restore();
      if (ticket === epoch.current) {
        reconcile(profile);
        if (!profile) cache.clear();
        setState(restoredState(profile));
      }
      return profile;
    } catch (error) {
      if (ticket === epoch.current) {
        // A dropped connection or a server hiccup during a background check is not a sign-out:
        // keep the signed-in screens, their data and any half-filled form, and check again later.
        // Only a cold start, or an answer that ends the session, changes the screen.
        if (previous.current && transientFailure(error)) return previous.current;
        cache.clear();
        setState(restoreFailureState(error));
      }
      return undefined;
    }
  }
  async function establish(work: () => Promise<MobileSession>) {
    const ticket = ++epoch.current;
    blocked.current = true;
    try {
      const profile = await sessions.establish(work);
      if (ticket === epoch.current) {
        reconcile(profile);
        cache.clear();
        setState(restoredState(profile));
      }
      return profile;
    } finally {
      if (ticket === epoch.current) blocked.current = false;
    }
  }
  async function logout(allDevices = false) {
    const ticket = ++epoch.current;
    blocked.current = true;
    try {
      await sessions.logout(allDevices);
      if (ticket === epoch.current) {
        blocked.current = false;
        setState({ phase: 'guest' });
      }
    } catch (error) {
      if (ticket === epoch.current) {
        const next = logoutFailureState(error, allDevices);
        blocked.current = next.phase === 'cleanup';
        setState(next);
      }
      throw error;
    } finally {
      cache.clear();
    }
  }
  useEffect(() => {
    void refetch();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refetch();
    }, 30000);
    const listener = AppState.addEventListener('change', (value) => {
      focusManager.setFocused(value === 'active');
      if (value === 'active') void refetch();
    });
    return () => {
      epoch.current += 1;
      clearInterval(timer);
      listener.remove();
      cache.clear();
    };
  }, [cache]);
  return {
    profile: state.phase === 'authenticated' ? state.profile : undefined,
    isPending: state.phase === 'restoring',
    isError: state.phase === 'unavailable',
    error: state.phase === 'unavailable' ? state.error : undefined,
    cleanupError: state.phase === 'cleanup' ? state.error : undefined,
    logoutNotice: state.phase === 'guest' ? state.notice : undefined,
    retryCleanup: () => logout(state.phase === 'cleanup' && state.allDevices),
    refetch,
    establish,
    logout,
  };
}
type LiveSession = ReturnType<typeof useLiveSession>;
const SessionContext = createContext<LiveSession | undefined>(undefined);
function LiveProvider({ children }: { children: ReactNode }) {
  const session = useLiveSession();
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}
export function Providers({ children }: { children: ReactNode }) {
  const [cache] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: 0 },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(
    () =>
      startFinancialDaySync(cache, {
        active: () => AppState.currentState === 'active',
        subscribe: (check) => {
          const listener = AppState.addEventListener('change', (value) => {
            if (value === 'active') check();
          });
          return () => listener.remove();
        },
      }),
    [cache],
  );
  return (
    <QueryClientProvider client={cache}>
      <LiveProvider>{children}</LiveProvider>
    </QueryClientProvider>
  );
}
export function useSession(): LiveSession {
  const session = useContext(SessionContext);
  if (!session) throw new Error('Session provider unavailable');
  return session;
}

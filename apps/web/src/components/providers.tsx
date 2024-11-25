'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { browserClient, csrfCookie } from '../lib/client';
import { restoreSession } from '../lib/session';
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: 0, gcTime: 0 },
          mutations: { retry: false, gcTime: 0 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () =>
      restoreSession(
        browserClient(),
        // Without cross-tab exclusion, require sign-in instead of risking refresh reuse.
        () => Boolean(navigator.locks) && Boolean(csrfCookie(document.cookie)),
        async (work) => await navigator.locks.request('hsm-session-refresh', work),
      ),
    refetchOnWindowFocus: 'always',
    refetchInterval: 30000,
  });
}

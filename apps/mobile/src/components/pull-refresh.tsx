import { createContext, useCallback, useContext, useState } from 'react';
import { RefreshControl, ScrollView, type ScrollViewProps } from 'react-native';
import { QueryClientContext, type QueryClient } from '@tanstack/react-query';
// Used when the query library is replaced (some isolated tests mock it).
const noClient = createContext<QueryClient | undefined>(undefined);
import { mobileColors as c } from '@hsm/ui';
// Pull down on any screen to reload everything it shows (every query mounted on it). This is
// the app's only manual refresh; screens have no Refresh buttons.
export function usePullRefresh() {
  const cache = useContext(QueryClientContext ?? noClient);
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    if (!cache) return;
    setRefreshing(true);
    try {
      await cache.refetchQueries({ type: 'active' });
    } finally {
      setRefreshing(false);
    }
  }, [cache]);
  // Without a query client (isolated component tests) there is nothing to reload.
  if (!cache) return undefined;
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => void onRefresh()}
      colors={[c.primary]}
      tintColor={c.primary}
    />
  );
}
// A page ScrollView with pull-to-refresh built in.
export function PullScrollView(props: ScrollViewProps) {
  const refresh = usePullRefresh();
  return <ScrollView {...props} {...(refresh ? { refreshControl: refresh } : {})} />;
}

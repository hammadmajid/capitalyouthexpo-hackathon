import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

// Mounted stack screens keep their state/cache, but only the visible route reads.
// Re-enabling stale queries performs one deduplicated read on navigation return.
export function useAdminQueryActivity() {
  const [active, setActive] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      return () => setActive(false);
    }, []),
  );
  return active;
}

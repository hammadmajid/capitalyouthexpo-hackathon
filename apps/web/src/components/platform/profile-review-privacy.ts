'use client';
import { useEffect, useRef } from 'react';
// Private details/URLs are never query data; reject late completions after focus loss.
export function useProfileReviewPrivacy(clear: () => void, blur = true) {
  const epoch = useRef(0),
    reset = useRef(clear);
  reset.current = clear;
  useEffect(() => {
    function hide() {
      epoch.current += 1;
      reset.current();
    }
    if (blur) window.addEventListener('blur', hide);
    document.addEventListener('visibilitychange', hidden);
    function hidden() {
      if (document.visibilityState === 'hidden') hide();
    }
    return () => {
      epoch.current += 1;
      window.removeEventListener('blur', hide);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [blur]);
  return epoch;
}

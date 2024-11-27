import { useAdminSynchronization } from './synchronization';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Redirect, useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../providers';
import { Page } from '../frame';
import { Button, Copy } from '../ui';
import { adminSignature, canUseAdmin } from '../../lib/admin-access';
import { clearAdminCache } from '../../lib/admin-cache';
// ADM-001 / SEC-003: each focused staff route re-proves live authority before mounting data.
export function AdminAccess({
  children,
  rootOnly = false,
  cacheBoundary = false,
}: {
  children: ReactNode;
  rootOnly?: boolean;
  cacheBoundary?: boolean;
}) {
  useAdminSynchronization(cacheBoundary);
  const session = useSession();
  const cache = useQueryClient();
  const refresh = useRef(session.refetch);
  refresh.current = session.refetch;
  const signature = adminSignature(session.profile);
  const [verified, setVerified] = useState<string>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      setFailed(false);
      void refresh
        .current()
        .then((profile) => {
          if (!live) return;
          if (canUseAdmin(profile, rootOnly)) setVerified(adminSignature(profile));
          else {
            setVerified(undefined);
            clearAdminCache(cache);
            setFailed(true);
          }
        })
        .catch(() => {
          if (live) {
            setVerified(undefined);
            clearAdminCache(cache);
            setFailed(true);
          }
        });
      return () => {
        live = false;
      };
    }, [signature, rootOnly, cache, attempt]),
  );
  useEffect(
    () => () => {
      if (cacheBoundary) clearAdminCache(cache);
    },
    [cache, cacheBoundary],
  );
  if (!session.profile) return <Redirect href="/" />;
  if (!canUseAdmin(session.profile, rootOnly)) return <Redirect href="/account" />;
  if (verified !== signature)
    return (
      <Page title={failed ? 'Admin access unavailable' : 'Checking Admin access'}>
        <Copy>
          {failed
            ? 'Reconnect and retry the access check.'
            : 'Verifying your current server permissions…'}
        </Copy>
        {failed ? (
          <Button label="Retry Admin access" onPress={() => setAttempt((value) => value + 1)} />
        ) : null}
      </Page>
    );
  return <>{children}</>;
}

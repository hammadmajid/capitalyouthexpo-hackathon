'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  createTransportRoute,
  readBranchRoutes,
  readInventoryAccess,
  updateTransportRoute,
} from '@hsm/api-client';
import type { TransportRoute } from '@hsm/contracts';
import { browserClient } from '../../lib/client';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui/button';
import { CommandRecovery } from './command-recovery';
import { TransportRouteDetails } from './transport-route-details';
import { TransportRouteEditor, type RouteInput } from './transport-route-editor';
import { useCommand } from './use-command';
// CHG-061: transport routes are configured in Hostel Setup only; Operations keeps riders,
// requests and fees. CHG-049: a route is a name and the places it serves.
export function TransportRoutesSetup({ actorId, branchId }: { actorId: string; branchId: string }) {
  const routesKey = ['branch-routes', actorId, branchId],
    overviewKey = ['transport-overview', actorId, branchId];
  const access = useQuery({
    queryKey: ['transport-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: 'always',
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const grants = access.isSuccess && !access.isFetching ? access.data.permissions : [];
  const canEdit = grants.includes('listing_edit') && grants.includes('pricing_edit');
  const routes = useQuery({
    queryKey: routesKey,
    gcTime: 0,
    retry: false,
    queryFn: () => readBranchRoutes(browserClient(), branchId),
  });
  const [editing, setEditing] = useState<TransportRoute>(),
    [creating, setCreating] = useState(false);
  const save = useCommand(
    'BranchTransport:save',
    ({ input, route }: { input: RouteInput; route: TransportRoute }, key) =>
      updateTransportRoute(
        browserClient(),
        branchId,
        route.id,
        { ...input, expectedVersion: route.version },
        key,
      ),
    [routesKey, overviewKey],
  );
  const create = useCommand(
    'BranchTransport:create',
    (input: RouteInput, key) => createTransportRoute(browserClient(), branchId, input, key),
    [routesKey, overviewKey],
  );
  const failure = access.error ?? routes.error ?? save.error ?? create.error;
  return (
    <section aria-label="Transport routes" className="space-y-2">
      <CommandRecovery command={save} />
      <CommandRecovery command={create} />
      <h3 className="font-semibold">Transport</h3>
      {failure ? <p role="alert">{errorMessage(failure)}</p> : null}
      {routes.isSuccess && !routes.data.data.length ? <p>No transport routes yet.</p> : null}
      {routes.isSuccess
        ? routes.data.data.map((route) => (
            <div key={route.id} className="rounded-xl border border-border p-3">
              <TransportRouteDetails route={route} hidePrice />
              {route.status === 'inactive' ? <p>Private</p> : null}
              {canEdit ? (
                <Button variant="secondary" onClick={() => setEditing(route)}>
                  Edit {route.name}
                </Button>
              ) : null}
            </div>
          ))
        : null}
      {canEdit && !routes.isError && !editing && !creating ? (
        <Button variant="secondary" onClick={() => setCreating(true)}>
          Add route
        </Button>
      ) : null}
      {canEdit && !routes.isError && creating ? (
        <TransportRouteEditor
          busy={create.isPending || create.unresolved}
          save={(input) => create.mutate(input, { onSuccess: () => setCreating(false) })}
          close={() => setCreating(false)}
        />
      ) : null}
      {canEdit && !routes.isError && editing ? (
        <TransportRouteEditor
          key={editing.id}
          route={editing}
          busy={save.isPending || save.unresolved}
          save={(input) =>
            save.mutate({ input, route: editing }, { onSuccess: () => setEditing(undefined) })
          }
          close={() => setEditing(undefined)}
        />
      ) : null}
    </section>
  );
}

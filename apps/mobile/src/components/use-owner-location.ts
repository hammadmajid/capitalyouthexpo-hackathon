import { useCallback, useEffect, useRef, useState } from 'react';
import { detectOwnerLocation, type OwnerLocationResult } from '../lib/owner-location';
export type OwnerLocationControl = {
  state: OwnerLocationResult | { status: 'idle' | 'detecting' };
  detect: () => Promise<import('@hsm/api-client').MapPin | undefined>;
};
export function useOwnerLocation(actorId: string | undefined): OwnerLocationControl {
  const [snapshot, setSnapshot] = useState<{
    actorId: string | undefined;
    state: OwnerLocationControl['state'];
  }>({ actorId: undefined, state: { status: 'idle' } });
  const mounted = useRef(false),
    generation = useRef(0);
  const pending = useRef<{ actorId: string; request: Promise<OwnerLocationResult> } | undefined>(
    undefined,
  );
  const detect = useCallback(async () => {
    if (!actorId) return undefined;
    const sequence = ++generation.current;
    setSnapshot({ actorId, state: { status: 'detecting' } });
    if (pending.current?.actorId !== actorId)
      pending.current = { actorId, request: detectOwnerLocation() };
    const request = pending.current.request;
    const result = await request;
    if (pending.current?.request === request) pending.current = undefined;
    if (!mounted.current || sequence !== generation.current) return undefined;
    setSnapshot({ actorId, state: result });
    return result.status === 'ready' ? result.pin : undefined;
  }, [actorId]);
  useEffect(() => {
    mounted.current = true;
    setSnapshot({ actorId, state: { status: 'idle' } });
    if (actorId) void detect();
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [actorId, detect]);
  return { state: snapshot.actorId === actorId ? snapshot.state : { status: 'idle' }, detect };
}

'use client';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { readVisitingHours } from '@hsm/api-client';
import { visitingScheduleSchema, type VisitingWindow } from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import type { useVisitCommand } from './use-visit-command';
import { Button } from './ui/button';
type Props = {
  actorId: string;
  branchId: string;
  accessUnavailable: boolean;
  operation: ReturnType<typeof useVisitCommand>;
};
export function VisitingHours({ actorId, branchId, accessUnavailable, operation }: Props) {
  const query = useQuery({
    queryKey: ['visits', actorId, 'hours', branchId],
    gcTime: 0,
    retry: false,
    enabled: !accessUnavailable,
    queryFn: () => readVisitingHours(browserClient(), branchId),
  });
  const { mutation, locked } = operation,
    [draft, setDraft] = useState<VisitingWindow[] | null>(null),
    [baseVersion, setBaseVersion] = useState<string>(),
    [error, setError] = useState('');
  useEffect(() => {
    if (mutation.isSuccess && operation.kind === 'hours') {
      setDraft(null);
      setBaseVersion(undefined);
    }
  }, [mutation.isSuccess, operation.kind]);
  if (accessUnavailable || query.error)
    return (
      <div>
        <p role="alert">
          {accessUnavailable ? 'Current branch access required.' : errorMessage(query.error)}
        </p>
        <Button variant="secondary" onClick={() => void query.refetch()}>
          Refresh visiting hours access
        </Button>
      </div>
    );
  if (!query.data || query.isFetching) return <p role="status">Loading visiting hours…</p>;
  const windows = draft ?? query.data.windows;
  function update(next: VisitingWindow[]) {
    setBaseVersion((current) => current ?? query.data?.version);
    setDraft(next);
  }
  function save() {
    const parsed = visitingScheduleSchema.safeParse(windows);
    if (!parsed.success || !query.data) {
      setError('Use ordered, non-overlapping visiting windows.');
      return;
    }
    setError('');
    mutation.mutate({
      kind: 'hours',
      branchId,
      body: { expectedVersion: baseVersion ?? query.data.version, windows: parsed.data },
    });
  }
  function change(index: number, patch: Partial<VisitingWindow>) {
    update(
      windows.map((window, position) => (position === index ? { ...window, ...patch } : window)),
    );
  }
  return (
    <>
      <fieldset disabled={locked} className="space-y-3">
        <legend>Weekly visiting hours (Asia/Karachi)</legend>
        {!windows.length ? <p>No visiting hours configured. New visits are unavailable.</p> : null}
        {windows.map((window, index) => (
          <div key={index} className="space-y-2">
            <label>
              Day
              <select
                className="field-input"
                value={window.dayOfWeek}
                onChange={(event) => change(index, { dayOfWeek: Number(event.target.value) })}
              >
                {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(
                  (day, number) => (
                    <option key={day} value={number}>
                      {day}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>
              Opens
              <input
                className="field-input"
                type="time"
                value={window.opensAt}
                onChange={(event) => change(index, { opensAt: event.target.value })}
              />
            </label>
            <label>
              Closes
              <input
                className="field-input"
                type="time"
                value={window.closesAt}
                onChange={(event) => change(index, { closesAt: event.target.value })}
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => update(windows.filter((_, position) => position !== index))}
            >
              Remove window
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          disabled={windows.length >= 100}
          onClick={() => update([...windows, { dayOfWeek: 0, opensAt: '', closesAt: '' }])}
        >
          Add visiting window
        </Button>
        <Button onClick={save}>Save visiting hours</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setDraft(null);
            setBaseVersion(undefined);
            void query.refetch();
          }}
        >
          Discard draft and reload hours
        </Button>
      </fieldset>
      {error || (operation.kind === 'hours' && mutation.error) ? (
        <p role="alert">{error || errorMessage(mutation.error)}</p>
      ) : null}
      {mutation.isSuccess && operation.kind === 'hours' ? (
        <p role="status">Visiting hours saved.</p>
      ) : null}
      {locked && !mutation.isPending && operation.kind === 'hours' ? (
        <Button onClick={() => mutation.mutate(undefined)}>Retry original hours request</Button>
      ) : null}
    </>
  );
}

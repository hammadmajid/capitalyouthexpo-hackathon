'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { calendarDateSchema, visitStartIsWithinHours } from '@hsm/contracts';
import { readVisitSlots, visitStartFromLocal } from '@hsm/api-client';
import { useSession } from './providers';
import { browserClient } from '../lib/client';
import { authenticationPath, customerProfilePath } from '../lib/return-path';
import { errorMessage } from '../lib/messages';
import { useVisitCommand } from './use-visit-command';
import { Button } from './ui/button';
export function VisitRequest({ branchId, slug }: { branchId: string; slug: string }) {
  const session = useSession(),
    returnTo = '/hostels/' + branchId;
  if (session.isPending) return <p role="status">Checking visit access…</p>;
  if (!session.data || session.error)
    return (
      <Link className="text-link" href={authenticationPath('login', returnTo)}>
        Sign in to request a visit
      </Link>
    );
  if (!session.data.capabilities.customer)
    return (
      <Link className="text-link" href={customerProfilePath(returnTo)}>
        Complete your Customer profile to request a visit
      </Link>
    );
  return (
    <Request
      key={session.data.user.id + ':' + branchId}
      actorId={session.data.user.id}
      branchId={branchId}
      slug={slug}
    />
  );
}
function Request({ actorId, branchId, slug }: { actorId: string; branchId: string; slug: string }) {
  const [date, setDate] = useState(''),
    [time, setTime] = useState(''),
    [error, setError] = useState('');
  const { mutation, locked } = useVisitCommand(actorId);
  const slots = useQuery({
    queryKey: ['visit-slots', slug, date],
    enabled: calendarDateSchema.safeParse(date).success,
    retry: false,
    queryFn: () => readVisitSlots(browserClient(), slug, date),
  });
  function request() {
    try {
      const requestedStart = visitStartFromLocal(date, time);
      if (
        !slots.data ||
        slots.data.branchId !== branchId ||
        !visitStartIsWithinHours(requestedStart, slots.data.windows)
      ) {
        setError('Choose a time within the current visiting hours.');
        return;
      }
      setError('');
      mutation.mutate({ kind: 'request', body: { branchId, requestedStart } });
    } catch {
      setError('Enter a valid date and time in Asia/Karachi.');
    }
  }
  return (
    <section aria-label="Request hostel visit" className="space-y-3">
      <h2>Request a visit</h2>
      <p>All visiting times are in Asia/Karachi. A request needs hostel approval.</p>
      <label className="field-label">
        Visit date
        <input
          className="field-input"
          type="date"
          value={date}
          disabled={locked}
          onChange={(event) => {
            setDate(event.target.value);
            mutation.reset();
          }}
        />
      </label>
      <label className="field-label">
        Visit time
        <input
          className="field-input"
          type="time"
          value={time}
          disabled={locked}
          onChange={(event) => {
            setTime(event.target.value);
            mutation.reset();
          }}
        />
      </label>
      {calendarDateSchema.safeParse(date).success && slots.isFetching ? (
        <p role="status">Loading visiting hours…</p>
      ) : null}
      {slots.error ? (
        <>
          <p role="alert">{errorMessage(slots.error)}</p>
          <Button variant="secondary" onClick={() => void slots.refetch()}>
            Reload available visiting hours
          </Button>
        </>
      ) : null}
      {slots.data && !slots.error && !slots.isFetching ? (
        slots.data.branchId !== branchId ? (
          <p role="alert">Hostel details changed. Reload this hostel before requesting a visit.</p>
        ) : slots.data.windows.length ? (
          <ul>
            {slots.data.windows.map((window) => (
              <li key={window.opensAt}>
                {window.opensAt}–{window.closesAt}
              </li>
            ))}
          </ul>
        ) : (
          <p>No visiting hours are configured for this day.</p>
        )
      ) : null}
      <Button
        disabled={
          locked ||
          mutation.isSuccess ||
          slots.isFetching ||
          Boolean(slots.error) ||
          !slots.data?.windows.length ||
          slots.data.branchId !== branchId
        }
        onClick={request}
      >
        Send visit request
      </Button>
      {error || mutation.error ? <p role="alert">{error || errorMessage(mutation.error)}</p> : null}
      {locked && !mutation.isPending ? (
        <Button onClick={() => mutation.mutate(undefined)}>Retry original visit request</Button>
      ) : null}
      {mutation.isSuccess ? (
        <p role="status">
          Visit requested. Open My visits in your Customer space for approval or a proposed time.
        </p>
      ) : null}
    </section>
  );
}

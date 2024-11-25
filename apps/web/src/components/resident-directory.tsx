'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatDate, type ResidentDirectoryQuery } from '@hsm/contracts';
import { readInventoryAccess, readResidentDirectory, readResidentProfile } from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { StayRecordPanel } from './stay-record';
import { ResidentEdit } from './residents/resident-edit';
import { ResidentLinkRequests } from './resident-link-requests';
type Filters = Pick<ResidentDirectoryQuery, 'sort'> &
  Partial<Pick<ResidentDirectoryQuery, 'q' | 'status' | 'linked'>>;
const statusLabel = { current: 'Current resident', former: 'Former resident', none: 'No Stay' };
export function ResidentDirectory(props: { actorId: string; branchId: string }) {
  return <Directory key={props.actorId + ':' + props.branchId} {...props} />;
}
function Profile(props: {
  actorId: string;
  branchId: string;
  residentId: string;
  close: () => void;
}) {
  const [stayId, setStayId] = useState<string>(),
    [editing, setEditing] = useState(false);
  const profile = useQuery({
    queryKey: ['resident-profile', props.actorId, props.branchId, props.residentId],
    gcTime: 0,
    retry: false,
    queryFn: () => readResidentProfile(browserClient(), props.branchId, props.residentId),
  });
  if (profile.isPending) return <p role="status">Loading resident profile…</p>;
  if (profile.isError) return <p role="alert">{errorMessage(profile.error)}</p>;
  const data = profile.data;
  return (
    <section
      aria-label="Resident profile"
      className="space-y-2 rounded-input border border-hsm-border p-4"
    >
      <h3 className="font-semibold">{data.displayName}</h3>
      <p>{statusLabel[data.status]}</p>
      <p>{data.linked ? 'Linked to a customer account' : 'Offline resident (no linked account)'}</p>
      <p>Phone: {data.contact.phone ?? 'Not provided'}</p>
      <p>Email: {data.contact.email ?? 'Not provided'}</p>
      <p>Resident since {formatDate(data.createdAt)}</p>
      {/* RES-006 / CHG-009: linked residents keep their own account details. */}
      {!data.linked && editing ? (
        <ResidentEdit
          actorId={props.actorId}
          branchId={props.branchId}
          residentId={props.residentId}
          name={data.displayName}
          phone={data.contact.phone}
          email={data.contact.email}
          close={() => setEditing(false)}
        />
      ) : null}
      {!data.linked && !editing ? (
        <Button variant="secondary" onClick={() => setEditing(true)}>
          Edit resident details
        </Button>
      ) : null}
      {data.currentStay ? (
        <p>
          Current accommodation: Room {data.currentStay.roomLabel ?? '—'}
          {data.currentStay.bedLabel ? ', Bed ' + data.currentStay.bedLabel : ''} (since{' '}
          {data.currentStay.moveInDate})
        </p>
      ) : null}
      <h4 className="font-semibold">Stays</h4>
      {data.stays.length === 0 ? <p>No Stays recorded.</p> : null}
      <ul className="space-y-1">
        {data.stays.map((stay) => (
          <li key={stay.id}>
            {stay.moveInDate} · {stay.state.replaceAll('_', ' ')} ·{' '}
            {stay.source === 'booking' ? 'from booking' : 'walk-in'}{' '}
            <Button variant="secondary" onClick={() => setStayId(stay.id)}>
              View agreement and history ({stay.moveInDate})
            </Button>
          </li>
        ))}
      </ul>
      {data.staysTruncated ? <p>Only the 50 most recent Stays are listed.</p> : null}
      {stayId ? (
        <StayRecordPanel actorId={props.actorId} branchId={props.branchId} stayId={stayId} />
      ) : null}
      <Button variant="ghost" onClick={props.close}>
        Close resident profile
      </Button>
    </section>
  );
}
// RES-004 / CHG-009: one row per branch resident; staff with a live stay_manage grant only.
function without(filters: Filters, key: 'q' | 'status' | 'linked'): Filters {
  const { sort, q, status, linked } = filters;
  return {
    sort,
    ...(key !== 'q' && q !== undefined ? { q } : {}),
    ...(key !== 'status' && status !== undefined ? { status } : {}),
    ...(key !== 'linked' && linked !== undefined ? { linked } : {}),
  };
}
function Directory({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(''),
    [filters, setFilters] = useState<Filters>({ sort: 'name' }),
    [cursors, setCursors] = useState<string[]>([]),
    [selected, setSelected] = useState<string>();
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    queryFn: () => readInventoryAccess(browserClient(), branchId),
  });
  const cursor = cursors.at(-1);
  const page = useQuery({
    queryKey: ['resident-directory', actorId, branchId, filters, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: () =>
      readResidentDirectory(browserClient(), branchId, {
        ...filters,
        limit: 20,
        ...(cursor ? { cursor } : {}),
      }),
  });
  if (!access.data?.permissions.includes('stay_manage')) return null;
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        View residents
      </Button>
    );
  function apply(next: Filters) {
    setFilters(next);
    setCursors([]);
    setSelected(undefined);
  }
  return (
    <section aria-label="Residents" className="space-y-4">
      <h2 className="text-xl font-semibold">Residents</h2>
      <ResidentLinkRequests key={actorId + ':' + branchId} actorId={actorId} branchId={branchId} />
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const rest = without(filters, 'q');
          apply(draft.trim() ? { ...rest, q: draft.trim() } : rest);
        }}
      >
        <input
          aria-label="Search residents by name"
          value={draft}
          maxLength={100}
          onChange={(event) => setDraft(event.target.value)}
        />
        <Button type="submit" variant="secondary">
          Search residents
        </Button>
        <select
          aria-label="Resident status"
          value={filters.status ?? ''}
          onChange={(event) => {
            const rest = without(filters, 'status');
            const value = event.target.value;
            apply(
              value === 'current' || value === 'former' || value === 'none'
                ? { ...rest, status: value }
                : rest,
            );
          }}
        >
          <option value="">All residents</option>
          <option value="current">Current</option>
          <option value="former">Former</option>
          <option value="none">No Stay</option>
        </select>
        <select
          aria-label="Account link"
          value={filters.linked ?? ''}
          onChange={(event) => {
            const rest = without(filters, 'linked');
            const value = event.target.value;
            apply(value === 'true' || value === 'false' ? { ...rest, linked: value } : rest);
          }}
        >
          <option value="">Linked and offline</option>
          <option value="true">Linked accounts</option>
          <option value="false">Offline residents</option>
        </select>
        <select
          aria-label="Sort residents"
          value={filters.sort}
          onChange={(event) =>
            apply({ ...filters, sort: event.target.value === 'newest' ? 'newest' : 'name' })
          }
        >
          <option value="name">Name</option>
          <option value="newest">Newest first</option>
        </select>
      </form>
      {page.isPending ? <p role="status">Loading residents…</p> : null}
      {page.isError ? <p role="alert">{errorMessage(page.error)}</p> : null}
      {page.data ? (
        <>
          {page.data.data.length === 0 ? <p>No residents match.</p> : null}
          <ul className="space-y-2">
            {page.data.data.map((row) => (
              <li key={row.id}>
                <p className="font-medium">{row.displayName}</p>
                <p>
                  {statusLabel[row.status]} · {row.linked ? 'Linked account' : 'Offline'}
                  {row.currentStay
                    ? ' · Room ' +
                      (row.currentStay.roomLabel ?? '—') +
                      (row.currentStay.bedLabel ? ', Bed ' + row.currentStay.bedLabel : '')
                    : ''}
                </p>
                <Button variant="secondary" onClick={() => setSelected(row.id)}>
                  View profile for {row.displayName}
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            {cursors.length > 0 ? (
              <Button variant="secondary" onClick={() => setCursors(cursors.slice(0, -1))}>
                Previous residents
              </Button>
            ) : null}
            {page.data.nextCursor ? (
              <Button
                variant="secondary"
                onClick={() => setCursors([...cursors, page.data.nextCursor ?? ''])}
              >
                Next residents
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {selected ? (
        <Profile
          actorId={actorId}
          branchId={branchId}
          residentId={selected}
          close={() => setSelected(undefined)}
        />
      ) : null}
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Close residents
      </Button>
    </section>
  );
}

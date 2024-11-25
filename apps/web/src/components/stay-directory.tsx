'use client';
import { useState } from 'react';
import { OwnNoticeHost } from './own-notice-host';
import { StayInvoices } from './stay-invoices';
import { StayRecordPanel } from './stay-record';
import { PayRent } from './pay-rent';
import { ResidentServicesPanel } from './services/panels';
import { StayLifecycle } from './stay-lifecycle';
import { SettlementView } from './settlement-view';
import { StaffPaymentHost } from './staff-payment-host';
import { useQuery } from '@tanstack/react-query';
import { formatDate, stayStateSchema } from '@hsm/contracts';
import {
  readInventoryAccess,
  readStaffStays,
  readStaffStay,
  readCustomerStays,
  readCustomerStay,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
import { errorMessage } from '../lib/messages';
import { Button } from './ui/button';
import { OwnLinkStatus } from './customer/own-link-status';
type Props = { actorId: string; branchId?: string; accessUnavailable?: boolean };
export function StayDirectory(props: Props) {
  return (
    <OwnNoticeHost
      key={props.actorId + ':' + (props.branchId ?? 'own')}
      actorId={props.actorId}
      {...(props.branchId ? { branchId: props.branchId } : {})}
      unavailable={props.accessUnavailable ?? false}
    >
      {(onNotice) => (
        <StaffPaymentHost
          actorId={props.actorId}
          {...(props.branchId ? { branchId: props.branchId } : {})}
          unavailable={props.accessUnavailable ?? false}
        >
          {(onRecord) => <Directory {...props} onNotice={onNotice} onRecord={onRecord} />}
        </StaffPaymentHost>
      )}
    </OwnNoticeHost>
  );
}
function Directory({
  actorId,
  branchId,
  accessUnavailable = false,
  onNotice,
  onRecord,
}: Props & { onNotice: (id: string) => void; onRecord: (id: string) => void }) {
  const [open, setOpen] = useState(false),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>(),
    [draft, setDraft] = useState(''),
    [name, setName] = useState(''),
    [state, setState] = useState<(typeof stayStateSchema.options)[number]>();
  const key = ['private-stays', actorId, branchId ?? 'own'];
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    enabled: branchId !== undefined && !accessUnavailable,
    queryFn: () => readInventoryAccess(browserClient(), branchId ?? ''),
  });
  const allowed =
    !accessUnavailable &&
    (branchId === undefined ||
      (!access.isPending &&
        !access.isFetching &&
        !access.error &&
        Boolean(access.data?.permissions.includes('stay_manage'))));
  const page = useQuery({
    queryKey: [...key, 'page', cursor, name, state],
    gcTime: 0,
    retry: false,
    enabled: open && allowed,
    queryFn: () => {
      const query = { limit: 20, ...(cursor ? { cursor } : {}), ...(state ? { state } : {}) };
      return branchId
        ? readStaffStays(browserClient(), branchId, { ...query, ...(name ? { q: name } : {}) })
        : readCustomerStays(browserClient(), query);
    },
  });
  const fresh = open && allowed && !page.isPending && !page.isFetching && !page.error;
  const visibleId =
    fresh && page.data?.data.some((row) => row.id === selected) ? selected : undefined;
  const detail = useQuery({
    queryKey: [...key, 'detail', visibleId],
    gcTime: 0,
    retry: false,
    enabled: visibleId !== undefined,
    queryFn: () =>
      branchId
        ? readStaffStay(browserClient(), branchId, visibleId ?? '')
        : readCustomerStay(browserClient(), visibleId ?? ''),
  });
  const title = branchId ? 'Residents and stays' : 'My stays';
  if (branchId && !allowed && !accessUnavailable)
    return access.error ? (
      <div>
        <p role="alert">{errorMessage(access.error)}</p>
        <Button
          onClick={() => {
            void access.refetch();
          }}
        >
          Retry Stay access
        </Button>
      </div>
    ) : null;
  if (!open)
    return (
      <Button variant="secondary" disabled={accessUnavailable} onClick={() => setOpen(true)}>
        {title}
      </Button>
    );
  function reset() {
    setSelected(undefined);
    setCursor(undefined);
  }
  const error = page.error ?? detail.error;
  return (
    <section aria-label={title} className="space-y-4">
      <h2 className="text-xl font-semibold">{title}</h2>
      {branchId ? null : <OwnLinkStatus actorId={actorId} />}
      <Button
        variant="ghost"
        onClick={() => {
          reset();
          setOpen(false);
        }}
      >
        Close stays
      </Button>
      {accessUnavailable ? (
        <p role="alert">Branch access must refresh before residents can be shown.</p>
      ) : error ? (
        <>
          <p role="alert">{errorMessage(error)}</p>
          <Button
            onClick={() => {
              setSelected(undefined);
              void page.refetch();
            }}
          >
            Retry stays
          </Button>
        </>
      ) : (
        <>
          <label className="field-label">
            Stay status
            <select
              aria-label="Stay status"
              className="field-input"
              value={state ?? ''}
              onChange={(event) => {
                reset();
                setState(
                  event.target.value ? stayStateSchema.parse(event.target.value) : undefined,
                );
              }}
            >
              <option value="">All stays</option>
              {stayStateSchema.options.map((value) => (
                <option key={value} value={value}>
                  {value.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          {branchId ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                reset();
                setName(draft.trim());
              }}
              className="space-y-2"
            >
              <label className="field-label">
                Resident name
                <input
                  aria-label="Resident name"
                  className="field-input"
                  value={draft}
                  maxLength={100}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <Button type="submit">Search residents</Button>
            </form>
          ) : null}
          {!fresh ? (
            <p role="status">Loading stays…</p>
          ) : (
            <>
              {!page.data?.data.length ? (
                <p>No stays match this view.</p>
              ) : (
                <ul className="space-y-3">
                  {page.data.data.map((row) => (
                    <li key={row.id} className="rounded-input border border-hsm-border p-4">
                      <p className="font-semibold">{row.displayName}</p>
                      <p>{row.state.replaceAll('_', ' ')}</p>
                      <p>Move-in: {formatDate(row.moveInDate + 'T00:00:00.000Z')}</p>
                      <p>
                        Expected departure:{' '}
                        {row.expectedLeaveDate
                          ? formatDate(row.expectedLeaveDate + 'T00:00:00.000Z')
                          : 'Open-ended agreement'}
                      </p>
                      <p>
                        {row.currentAssignment
                          ? 'Current accommodation assigned'
                          : 'No current occupancy assignment'}
                      </p>
                      <Button variant="secondary" onClick={() => setSelected(row.id)}>
                        View stay for {row.displayName}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              {page.data?.nextCursor ? (
                <Button
                  onClick={() => {
                    setSelected(undefined);
                    setCursor(page.data?.nextCursor ?? undefined);
                  }}
                >
                  Next stays
                </Button>
              ) : null}
              {cursor ? (
                <Button variant="secondary" onClick={reset}>
                  First stays
                </Button>
              ) : null}
            </>
          )}
          {visibleId ? (
            detail.isPending || detail.isFetching ? (
              <p role="status">Loading stay details…</p>
            ) : detail.data ? (
              <section
                aria-label="Stay details"
                className="space-y-2 rounded-input border border-hsm-border p-4"
              >
                <h3 className="font-semibold">Stay details</h3>
                <p>{detail.data.displayName}</p>
                <p>Phone: {detail.data.contact.phone ?? 'Not provided'}</p>
                <p>Email: {detail.data.contact.email ?? 'Not provided'}</p>
                <p>
                  Checked in:{' '}
                  {detail.data.checkedInAt ? formatDate(detail.data.checkedInAt) : 'Not checked in'}
                </p>
                <p>
                  Closed: {detail.data.closedAt ? formatDate(detail.data.closedAt) : 'Not closed'}
                </p>
                <StayRecordPanel
                  actorId={actorId}
                  stayId={detail.data.id}
                  {...(branchId ? { branchId } : {})}
                />
                {branchId &&
                access.data?.permissions.includes('finance_view') &&
                access.data.permissions.includes('payment_record') ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (detail.data) onRecord(detail.data.id);
                    }}
                  >
                    Record external payment
                  </Button>
                ) : null}
                <StayInvoices
                  actorId={actorId}
                  stayId={detail.data.id}
                  {...(branchId ? { branchId } : {})}
                  canView={!branchId || Boolean(access.data?.permissions.includes('finance_view'))}
                />
                {!branchId && detail.data.closedAt === null ? (
                  <PayRent actorId={actorId} stayId={detail.data.id} />
                ) : null}
                {!branchId && detail.data.checkedInAt !== null ? (
                  <ResidentServicesPanel
                    actorId={actorId}
                    stayId={detail.data.id}
                    closed={detail.data.closedAt !== null}
                  />
                ) : null}
                {branchId ? (
                  <StayLifecycle
                    actorId={actorId}
                    branchId={branchId}
                    stayId={detail.data.id}
                    version={detail.data.version}
                    closed={detail.data.closedAt !== null}
                    permissions={access.data?.permissions ?? []}
                  />
                ) : (
                  <SettlementView
                    actorId={actorId}
                    stayId={detail.data.id}
                    closed={detail.data.closedAt !== null}
                  />
                )}
                {!branchId &&
                detail.data.state === 'active' &&
                detail.data.checkedInAt !== null &&
                detail.data.closedAt === null ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      if (detail.data) onNotice(detail.data.id);
                    }}
                  >
                    Give departure notice
                  </Button>
                ) : null}
                <Button variant="ghost" onClick={() => setSelected(undefined)}>
                  Close stay details
                </Button>
              </section>
            ) : null
          ) : null}
        </>
      )}
    </section>
  );
}

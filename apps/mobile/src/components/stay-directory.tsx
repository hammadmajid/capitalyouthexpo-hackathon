import { mobileSurfaces } from '@hsm/ui';
import { StayDetails } from './stay-details';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { useState, useEffect, useRef } from 'react';
import { OwnNoticeHost } from './own-notice-host';
import { OwnResidentLinkStatus } from './own-resident-link-status';
import { StaffPaymentHost } from './staff-payment-host';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatDate, stayStateSchema } from '@hsm/contracts';
import { BedDouble, CalendarDays, ChevronRight } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { FilterChip, InvFact, StatusDot } from './inventory-tools';
const stateLabels: Record<string, string> = {
  check_in_ready: 'Ready',
  active: 'Active',
  notice_given: 'Notice',
  checkout_pending: 'Checkout',
  completed: 'Completed',
  cancelled_before_checkin: 'Cancelled',
  terminated: 'Terminated',
  abandoned: 'Abandoned',
};
import {
  readInventoryAccess,
  readStaffStays,
  readStaffStay,
  readCustomerStays,
  readCustomerStay,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
type Props = {
  actorId: string;
  standalone?: boolean;
  branchId?: string;
  accessUnavailable?: boolean;
};
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
  standalone = false,
  onNotice,
  onRecord,
}: Props & { onNotice: (id: string) => void; onRecord: (id: string) => void }) {
  const [open, setOpen] = useState(standalone),
    [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>(),
    [draft, setDraft] = useState(''),
    [name, setName] = useState(''),
    [stateIndex, setStateIndex] = useState(0);
  const state = stayStateSchema.options[stateIndex - 1];
  const key = ['private-stays', actorId, branchId ?? 'own'];
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    gcTime: 0,
    retry: false,
    enabled: branchId !== undefined && !accessUnavailable,
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId ?? ''),
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
    queryFn: async () => {
      const client = await actorClient(actorId),
        query = { limit: 20, ...(cursor ? { cursor } : {}), ...(state ? { state } : {}) };
      return branchId
        ? readStaffStays(client, branchId, { ...query, ...(name ? { q: name } : {}) })
        : readCustomerStays(client, query);
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
    queryFn: async () => {
      const client = await actorClient(actorId);
      return branchId
        ? readStaffStay(client, branchId, visibleId ?? '')
        : readCustomerStay(client, visibleId ?? '');
    },
  });
  // SEC-003: after a failure, the next successful reload (a pull) closes the open Stay, so a
  // failing detail never strands the list and private detail is not shown again unasked.
  const failed = useRef(false);
  if (page.error || detail.error) failed.current = true;
  const loadedAt = page.dataUpdatedAt;
  useEffect(() => {
    if (failed.current && !page.error) {
      failed.current = false;
      setSelected(undefined);
    }
  }, [loadedAt, page.error]);
  const title = branchId ? 'Residents and stays' : 'My stays';
  if (branchId && !allowed && !accessUnavailable)
    return access.error ? (
      <View className="gap-3">
        <Copy alert>{safeMessage(access.error)}</Copy>
      </View>
    ) : null;
  if (!open)
    return (
      <Button label={title} secondary disabled={accessUnavailable} onPress={() => setOpen(true)} />
    );
  function reset() {
    setSelected(undefined);
    setCursor(undefined);
  }
  const error = page.error ?? detail.error;
  return (
    <View className="gap-3">
      {!branchId ? <OwnResidentLinkStatus key={actorId} actorId={actorId} /> : null}
      {!standalone ? (
        <>
          <Copy>{title}</Copy>
          <Button
            label="Close stays"
            secondary
            onPress={() => {
              reset();
              setOpen(false);
            }}
          />
        </>
      ) : null}
      {accessUnavailable ? (
        <Copy alert>Pull down to load branch access before residents can be shown.</Copy>
      ) : error ? (
        <>
          <Copy alert>{safeMessage(error)}</Copy>
        </>
      ) : (
        <>
          {/* One chip per stay state; "All" clears the filter. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {[undefined, ...stayStateSchema.options].map((value, index) => (
                <FilterChip
                  key={value ?? 'all'}
                  text={value ? (stateLabels[value] ?? value) : 'All'}
                  label={'Stay status: ' + (value ? stateLabels[value] : 'All stays')}
                  selected={stateIndex === index}
                  onPress={() => {
                    reset();
                    setStateIndex(index);
                  }}
                />
              ))}
            </View>
          </ScrollView>
          {branchId ? (
            <>
              <AppHeader
                title="Stay history"
                showBack={false}
                search={{
                  label: 'Resident name',
                  value: draft,
                  onChange: setDraft,
                  maxLength: 100,
                  submitLabel: 'Search residents',
                  onSubmit: () => {
                    reset();
                    setName(draft.trim());
                  },
                }}
              />
            </>
          ) : null}
          {!fresh ? (
            <Skeleton kind="list" label="Loading stays…" />
          ) : (
            <>
              {visibleId ? null : !page.data?.data.length ? (
                <Copy>No stays match this view.</Copy>
              ) : (
                page.data.data.map((row) => (
                  <Pressable
                    key={row.id}
                    accessibilityRole="button"
                    accessibilityLabel={'View stay for ' + row.displayName}
                    onPress={() => setSelected(row.id)}
                    style={mobileSurfaces.icyCard}
                    className="gap-2 rounded-input border border-border p-4 frosted-card"
                  >
                    <View className="flex-row items-center justify-between gap-2">
                      <Text className="flex-1 font-heading text-body text-text">
                        {row.displayName}
                      </Text>
                      <StatusDot status={row.state} text={stateLabels[row.state] ?? row.state} />
                      <ChevronRight size={18} color={colors.primary} />
                    </View>
                    <InvFact Icon={CalendarDays}>
                      {formatDate(row.moveInDate + 'T00:00:00.000Z')} →{' '}
                      {row.expectedLeaveDate
                        ? formatDate(row.expectedLeaveDate + 'T00:00:00.000Z')
                        : 'Open-ended'}
                    </InvFact>
                    <InvFact Icon={BedDouble}>
                      {row.currentAssignment ? 'Bed assigned' : 'No current occupancy assignment'}
                    </InvFact>
                  </Pressable>
                ))
              )}
              {!visibleId && page.data?.nextCursor ? (
                <Button
                  label="Next stays"
                  onPress={() => {
                    setSelected(undefined);
                    setCursor(page.data?.nextCursor ?? undefined);
                  }}
                />
              ) : null}
              {!visibleId && cursor ? (
                <Button label="First stays" secondary onPress={reset} />
              ) : null}
            </>
          )}
          {visibleId ? (
            detail.isPending || detail.isFetching ? (
              <Skeleton kind="details" label="Loading stay details…" />
            ) : detail.data ? (
              <StayDetails
                actorId={actorId}
                {...(branchId ? { branchId } : {})}
                data={detail.data}
                permissions={access.data?.permissions ?? []}
                onNotice={onNotice}
                onRecord={onRecord}
                onClose={() => setSelected(undefined)}
              />
            ) : null
          ) : null}
        </>
      )}
    </View>
  );
}

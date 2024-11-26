import { NativeBranchServices } from './services/staff';
import { TransportWorkspace } from './transport/transport-workspace';
import { Skeleton } from './loading/skeleton';
import { Visits } from './visits';
import { Waitlist } from './waitlist';
import { Chat } from './chat';
import { NativeBillingPolicy } from './native-billing-policy';
import { BranchResidents } from './branch-residents';
import { NativeBillingCatalog } from './native-billing-catalog';
import { StaffWorkspace } from './staff/staff-workspace';
import { useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { mobileColors, mobileSurfaces } from '@hsm/ui';
import { readApi } from '@hsm/api-client';
import { branchSummarySchema } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { HostelBookings } from './hostel-bookings';
import { NativeInventory } from './native-inventory';
import { nativeScopeDenied } from './use-hostel-bookings';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { useOwnerScreenBack } from './owner-screen-back';
const page = z
  .object({ data: z.array(branchSummarySchema), nextCursor: z.string().uuid().nullable() })
  .strict();
export function Branches(props: {
  context: 'owner' | 'manager';
  actorId: string;
  initialSection?: string;
  initialMonth?: string;
}) {
  return (
    <BranchList
      key={[props.actorId, props.context, props.initialSection, props.initialMonth].join(':')}
      {...props}
    />
  );
}
function BranchList({
  context,
  actorId,
  initialSection,
  initialMonth,
}: {
  context: 'owner' | 'manager';
  actorId: string;
  initialSection?: string;
  initialMonth?: string;
}) {
  const [cursor, setCursor] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const query = useQuery({
    queryKey: ['branches', actorId, context, cursor],
    gcTime: 0,
    queryFn: async () => {
      const client = await actorClient(actorId);
      return readApi(
        client.GET(context === 'owner' ? '/v1/owner/branches' : '/v1/manage/branches', {
          params: { query: { limit: 50, ...(cursor ? { cursor } : {}) } },
        }),
        page,
      );
    },
    retry: false,
  });
  if (query.isPending) return <Skeleton kind="list" label="Loading your branches…" />;
  if ((query.isError && !query.data) || nativeScopeDenied(query.error))
    return (
      <>
        <Copy alert>{safeMessage(query.error)}</Copy>
        <Button
          label="Try again"
          onPress={() => {
            void query.refetch();
          }}
        />
      </>
    );
  if (!query.data) return null;
  if (selected && query.data.data.some((branch) => branch.id === selected))
    return (
      <SelectedBranch
        actorId={actorId}
        branchId={selected}
        unavailable={Boolean(query.error) || query.isFetching}
        onClose={() => setSelected(undefined)}
        hideBillingPolicy={context === 'owner'}
        {...(initialSection ? { initialSection } : {})}
        {...(initialMonth ? { initialMonth } : {})}
      />
    );
  return (
    <>
      <Copy>Your branches</Copy>
      {query.error ? <Copy alert>{safeMessage(query.error)}</Copy> : null}
      {query.data.data.length ? (
        query.data.data.map((branch) => (
          <Button
            key={branch.id}
            label={branch.name}
            secondary={selected !== branch.id}
            onPress={() => setSelected(branch.id)}
          />
        ))
      ) : (
        <Copy>No branches</Copy>
      )}
      {query.data.nextCursor ? (
        <Button
          label="Next branches"
          secondary
          onPress={() => {
            setSelected(undefined);
            setCursor(query.data.nextCursor ?? undefined);
          }}
        />
      ) : null}
      {cursor ? (
        <Button
          label="First branches"
          secondary
          onPress={() => {
            setSelected(undefined);
            setCursor(undefined);
          }}
        />
      ) : null}
    </>
  );
}
function SelectedBranch(props: {
  actorId: string;
  branchId: string;
  unavailable: boolean;
  onClose: () => void;
  hideBillingPolicy: boolean;
  initialSection?: string;
  initialMonth?: string;
}) {
  const screenBack = useOwnerScreenBack(props.onClose, true, -1);
  return (
    <>
      {!screenBack ? <Button label="Back to branches" secondary onPress={props.onClose} /> : null}
      <BranchPanels
        actorId={props.actorId}
        branchId={props.branchId}
        unavailable={props.unavailable}
        hideBillingPolicy={props.hideBillingPolicy}
        {...(props.initialSection ? { initialSection: props.initialSection } : {})}
        {...(props.initialMonth ? { initialMonth: props.initialMonth } : {})}
      />
    </>
  );
}
// Operational tools for one authorised branch; the server re-checks scope on every call.
// One section is open at a time so a branch's tools are a short menu, not one long page.
// [key, accessible name, short chip text]
const sections = [
  ['bookings', 'Bookings', 'Bookings'],
  ['stays', 'Residents and stays', 'Residents'],
  ['inventory', 'Rooms, beds and rent', 'Rooms & Rent'],
  ['visits', 'Visits', 'Visits'],
  ['waitlist', 'Waitlist', 'Waitlist'],
  // CHG-042: the one Transport home (routes, trips, pricing, riders).
  ['transport', 'Transport', 'Transport'],
  ['chat', 'Messages', 'Messages'],
  ['services', 'Complaints and services', 'Complaints'],
  ['billing-policy', 'Billing policy', 'Billing'],
  ['billing-catalog', 'Charges catalog', 'Charges'],
  ['staff', 'Staff and salaries', 'Staff'],
] as const;
type Section = (typeof sections)[number][0];
export function BranchPanels({
  actorId,
  branchId,
  unavailable,
  initialSection,
  initialMonth,
  single = false,
  hideBillingPolicy = false,
}: {
  actorId: string;
  branchId: string;
  unavailable: boolean;
  initialSection?: string;
  initialMonth?: string;
  // Opened from a Manager Home tile: the screen title names the tool, so no chip row.
  single?: boolean;
  // Owner Operations omits billing; Hostel Setup still owns the same settings.
  hideBillingPolicy?: boolean;
}) {
  const visibleSections = hideBillingPolicy
    ? sections.filter(([key]) => key !== 'billing-policy')
    : sections;
  const [selected, setOpen] = useState<Section>(
    visibleSections.find(
      ([key]) =>
        key ===
        (initialSection === 'transport-requests'
          ? 'transport'
          : initialSection === 'stays-due' || initialSection === 'stays-overdue'
            ? 'stays'
            : initialSection === 'staff-due'
              ? 'staff'
              : initialSection),
    )?.[0] ?? 'bookings',
  );
  const open = hideBillingPolicy && selected === 'billing-policy' ? 'bookings' : selected;
  const props = { actorId, branchId, accessUnavailable: unavailable };
  return (
    <>
      {single ? null : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Branch operation sections"
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
        >
          {visibleSections.map(([key, label, short]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: open === key }}
              onPress={() => setOpen(key)}
              style={[
                {
                  minHeight: 36,
                  justifyContent: 'center',
                  borderRadius: 24,
                  borderWidth: 1,
                  borderColor: mobileColors.border,
                  backgroundColor: mobileColors.surface + '70',
                  paddingHorizontal: 15,
                },
                open === key && mobileSurfaces.emeraldGlass,
              ]}
            >
              <Text
                className="font-heading"
                style={{
                  fontSize: 11,
                  color: open === key ? mobileColors.surface : mobileColors.primary,
                }}
              >
                {short}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      {open === 'bookings' ? <HostelBookings {...props} /> : null}
      {open === 'stays' ? (
        <BranchResidents
          {...props}
          {...(initialSection === 'stays-due' || initialSection === 'stays-overdue'
            ? { initialBilling: initialSection === 'stays-due' ? 'due' : 'overdue' }
            : {})}
          {...(initialMonth ? { initialMonth } : {})}
        />
      ) : null}
      {open === 'inventory' ? <NativeInventory {...props} embedded /> : null}
      {open === 'visits' ? <Visits {...props} /> : null}
      {open === 'waitlist' ? <Waitlist {...props} /> : null}
      {open === 'transport' ? (
        <TransportWorkspace
          actorId={actorId}
          branchId={branchId}
          initialStatus={initialSection === 'transport-requests' ? 'requested' : 'active'}
        />
      ) : null}
      {open === 'chat' ? <Chat {...props} /> : null}
      {open === 'services' ? (
        <NativeBranchServices
          actorId={actorId}
          branchId={branchId}
          standalone={single}
          complaintsOnly={!single}
        />
      ) : null}
      {/* The agreement template is set in Hostel Setup > Policies; not repeated here. */}
      {open === 'billing-policy' ? (
        <NativeBillingPolicy
          actorId={actorId}
          target={{ branchId }}
          accessUnavailable={unavailable}
          standalone={single}
        />
      ) : null}
      {open === 'billing-catalog' ? <NativeBillingCatalog {...props} standalone={single} /> : null}
      {open === 'staff' ? (
        <StaffWorkspace
          actorId={actorId}
          branchId={branchId}
          initialDue={initialSection === 'staff-due'}
        />
      ) : null}
    </>
  );
}

import { CalendarCheck, DoorClosed, Mail, Phone } from 'lucide-react-native';
import { useState } from 'react';
import { ResidentEditDialog } from './resident-edit-dialog';
import { InvFact } from './inventory-tools';
import { StayResidentPhoto } from './stay-resident-photo';
import { Text, View } from 'react-native';
import { mobileSurfaces } from '@hsm/ui';
import { formatDate, type InventoryPermission } from '@hsm/contracts';
import { branchPaymentProofQueue, type readStaffStay } from '@hsm/api-client';
import { useQuery } from '@tanstack/react-query';
import { actorClient } from '../lib/runtime';
import { NativePaymentReview } from './payment-review';
import { AppHeader } from './navigation/header';
import { Button } from './ui';
import { NativeStayRecord } from './stay-record';
import { NativePayRent } from './pay-rent';
import { NativeResidentServices } from './services/resident';
import { NativeStayLifecycle, NativeSettlement } from './stay-lifecycle';
import { StayInvoices } from './stay-invoices';
import { StayStaffSections } from './stay-staff-sections';
import { StaffStayPaymentSummary } from './staff-stay-payment-summary';
import { StaffStayTimeline } from './staff-stay-timeline';
import { StaffStayAccommodation } from './staff-stay-accommodation';
import { StaffResidentHeader } from './staff-resident-header';
import { StayPaymentReceipts } from './stay-payment-receipts';
type Stay = Awaited<ReturnType<typeof readStaffStay>>;
const has = (permissions: readonly InventoryPermission[], grants: string[]) =>
  grants.every((grant) => permissions.includes(grant as InventoryPermission));
export function StayDetails({
  actorId,
  branchId,
  data,
  permissions,
  onNotice,
  onRecord,
  onClose,
  onHistory,
}: {
  actorId: string;
  branchId?: string;
  data: Stay;
  permissions: readonly InventoryPermission[];
  onNotice: (id: string) => void;
  onRecord: (id: string) => void;
  onClose: () => void;
  onHistory?: (() => void) | undefined;
}) {
  const [sectionOpen, setSectionOpen] = useState(false);
  if (branchId) {
    return (
      <View className="gap-3">
        <StaffStay
          actorId={actorId}
          branchId={branchId}
          data={data}
          permissions={permissions}
          onRecord={onRecord}
          onClose={onClose}
          onHistory={onHistory}
          sectionOpen={sectionOpen}
          onSectionOpen={setSectionOpen}
        />
      </View>
    );
  }
  return (
    <View style={mobileSurfaces.icyCard} className="gap-3 rounded-input border border-border p-4">
      <AppHeader title="Stay details" backLabel="Back from stay details" onBack={onClose} />
      <OwnStay actorId={actorId} data={data} onNotice={onNotice} />
    </View>
  );
}
// Staff view: who and since when, then three tiles (agreement, money, stay actions).
function StaffStay(props: {
  actorId: string;
  branchId: string;
  data: Stay;
  permissions: readonly InventoryPermission[];
  onRecord: (id: string) => void;
  onClose: () => void;
  onHistory?: (() => void) | undefined;
  sectionOpen: boolean;
  onSectionOpen: (open: boolean) => void;
}) {
  const { actorId, branchId, data, permissions } = props;
  const canRecord = has(permissions, ['finance_view', 'payment_record']);
  const canEdit = permissions.includes('stay_manage');
  const [editing, setEditing] = useState(false),
    [agreementPanel, setAgreementPanel] = useState(false),
    [reviewing, setReviewing] = useState(false);
  const pending = useQuery({
    queryKey: ['payment-proof-queue', actorId, branchId, data.id, 'resident-action'],
    enabled: permissions.includes('finance_view'),
    retry: false,
    gcTime: 0,
    refetchInterval: 30000,
    queryFn: async () =>
      branchPaymentProofQueue(await actorClient(actorId), branchId, {
        state: 'submitted',
        stayId: data.id,
        limit: 1,
      }),
  });
  if (reviewing)
    return (
      <NativePaymentReview
        actorId={actorId}
        branchId={branchId}
        stayId={data.id}
        canDecide={canRecord}
        initiallyOpen
        onClose={() => setReviewing(false)}
      />
    );
  return (
    <>
      {editing ? (
        <ResidentEditDialog
          actorId={actorId}
          branchId={branchId}
          residentId={data.residentId}
          name={data.displayName}
          phone={data.contact.phone}
          email={data.contact.email}
          onClose={() => setEditing(false)}
        />
      ) : null}
      <StayStaffSections
        collectLabel={
          pending.isError
            ? 'Retry payment status'
            : pending.data?.data.length
              ? 'Check Invoice'
              : canRecord
                ? 'Collect Rent'
                : 'View Payments'
        }
        collectDisabled={permissions.includes('finance_view') && pending.isPending}
        onCollect={
          pending.isError
            ? () => {
                void pending.refetch();
              }
            : pending.data?.data.length
              ? () => setReviewing(true)
              : canRecord
                ? () => props.onRecord(data.id)
                : undefined
        }
        header={(onCheckout, onAgreement) => (
          <StaffResidentHeader
            actorId={actorId}
            branchId={branchId}
            data={data}
            onClose={props.onClose}
            onHistory={props.onHistory}
            onAgreement={onAgreement}
            onCheckout={canEdit ? onCheckout : undefined}
            onEdit={canEdit ? () => setEditing(true) : undefined}
          />
        )}
        timeline={
          <StaffStayTimeline
            moveInDate={data.moveInDate}
            expectedLeaveDate={data.expectedLeaveDate}
            closedAt={data.closedAt}
            state={data.state}
          />
        }
        summary={(onOpen) => (
          <StaffStayPaymentSummary
            onOpen={onOpen}
            actorId={actorId}
            branchId={branchId}
            stayId={data.id}
            moveInDate={data.moveInDate}
            expectedLeaveDate={data.expectedLeaveDate}
            closed={data.closedAt !== null}
            state={data.state}
            canView={permissions.includes('finance_view')}
          />
        )}
        accommodation={
          <StaffStayAccommodation
            actorId={actorId}
            branchId={branchId}
            bedId={data.currentAssignment?.bedId ?? null}
            roomAssigned={data.currentAssignment !== null}
          />
        }
        onOpenChange={(open) => {
          if (!open) setAgreementPanel(false);
          props.onSectionOpen(open);
        }}
        childPanel={agreementPanel}
        agreement={
          <NativeStayRecord
            actorId={actorId}
            stayId={data.id}
            branchId={branchId}
            onPanelChange={setAgreementPanel}
          />
        }
        money={
          <View className="gap-3">
            <StayInvoices
              actorId={actorId}
              stayId={data.id}
              branchId={branchId}
              canView={permissions.includes('finance_view')}
            />
            {permissions.includes('finance_view') ? (
              <StayPaymentReceipts actorId={actorId} branchId={branchId} stayId={data.id} />
            ) : null}
          </View>
        }
        showLifecycle={permissions.includes('stay_manage')}
        transfer={
          <NativeStayLifecycle
            actorId={actorId}
            branchId={branchId}
            stayId={data.id}
            version={data.version}
            closed={data.closedAt !== null}
            canStay={permissions.includes('stay_manage')}
            canExtend={false}
            canViewFinance={false}
            canSettle={false}
            canReprice={has(permissions, ['stay_manage', 'rent_manage', 'finance_view'])}
            canApplyDeposit={false}
          />
        }
        lifecycle={
          <NativeStayLifecycle
            actorId={actorId}
            branchId={branchId}
            stayId={data.id}
            version={data.version}
            closed={data.closedAt !== null}
            canStay={permissions.includes('stay_manage')}
            canTransfer={false}
            canExtend={has(permissions, ['stay_manage', 'rent_manage'])}
            canViewFinance={permissions.includes('finance_view')}
            canSettle={has(permissions, ['finance_view', 'checkout_manage'])}
            canReprice={has(permissions, ['stay_manage', 'rent_manage', 'finance_view'])}
            canApplyDeposit={has(permissions, [
              'finance_view',
              'checkout_manage',
              'payment_record',
            ])}
          />
        }
      />
    </>
  );
}
// Resident's own view: unchanged order (pay rent, record, services, settlement, invoices).
function OwnStay(props: { actorId: string; data: Stay; onNotice: (id: string) => void }) {
  const { actorId, data } = props;
  return (
    <>
      <StayResidentPhoto actorId={actorId} stayId={data.id} />
      <Text accessibilityRole="header" className="font-heading text-subtitle text-heading">
        {data.displayName}
      </Text>
      {data.contact.phone ? <InvFact Icon={Phone}>Phone: {data.contact.phone}</InvFact> : null}
      {data.contact.email ? <InvFact Icon={Mail}>Email: {data.contact.email}</InvFact> : null}
      <InvFact Icon={CalendarCheck}>
        Checked in: {data.checkedInAt ? formatDate(data.checkedInAt) : 'Not checked in'}
      </InvFact>
      {data.closedAt ? (
        <InvFact Icon={DoorClosed}>Closed: {formatDate(data.closedAt)}</InvFact>
      ) : null}
      {data.closedAt === null ? <NativePayRent actorId={actorId} stayId={data.id} /> : null}
      <NativeStayRecord actorId={actorId} stayId={data.id} />
      {data.checkedInAt !== null ? (
        <NativeResidentServices
          actorId={actorId}
          stayId={data.id}
          closed={data.closedAt !== null}
        />
      ) : null}
      <NativeSettlement actorId={actorId} stayId={data.id} closed={data.closedAt !== null} />
      <StayInvoices actorId={actorId} stayId={data.id} canView />
      <StayPaymentReceipts actorId={actorId} stayId={data.id} />
      {data.state === 'active' && data.checkedInAt !== null && data.closedAt === null ? (
        <Button label="Give departure notice" secondary onPress={() => props.onNotice(data.id)} />
      ) : null}
    </>
  );
}

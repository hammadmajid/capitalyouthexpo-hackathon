import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import {
  Banknote,
  Bus,
  FileImage,
  History,
  Images,
  Receipt,
  type LucideIcon,
} from 'lucide-react-native';
import { BedRent } from './bed-rent';
import { useQuery } from '@tanstack/react-query';
import { branchPaymentProofQueue, readBranchTransport, readInventoryAccess } from '@hsm/api-client';
import type { BedOccupancy } from '@hsm/contracts';
import { actorClient } from '../lib/runtime';
import { AppHeader } from './navigation/header';
import { BedActionTile } from './bed-action-tile';
import { StayInvoices } from './stay-invoices';
import { BedProofs, BedTransport } from './bed-resident-money';
import { NativeBedHistory } from './bed-history';
import { OwnerMediaGallery } from './owner-media-gallery';
type Section = { key: string; title: string; detail: string; Icon: LucideIcon; body: ReactNode };
// CHG-048: one tile per topic (big icon, short title) instead of one long page; each opens
// on its own with Back, like the Stay details screen. Money tiles need finance_view; the
// server rechecks it on every read.
export function BedSections(props: {
  actorId: string;
  branchId: string;
  bedId: string;
  roomId: string;
  stayId: string | null;
  upcoming: NonNullable<BedOccupancy['upcoming']>;
  onOpenStay: (stayId: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState<string>();
  const setOpen = (key: string | undefined) => {
    setOpenState(key);
    props.onOpenChange(key !== undefined);
  };
  const money = useMoney(props.actorId, props.branchId, props.stayId);
  const base = { actorId: props.actorId, branchId: props.branchId };
  const sections: Section[] = [
    {
      key: 'bed-rate',
      title: 'Bed Rent',
      detail: 'Price for this bed',
      Icon: Banknote,
      body: <BedRent {...base} bedId={props.bedId} />,
    },
    ...(money.stayId
      ? [
          {
            key: 'rent',
            title: 'Rent',
            detail: 'Bills · dues',
            Icon: Receipt,
            body: <StayInvoices {...base} stayId={money.stayId} canView openLatest />,
          },
          {
            key: 'proofs',
            title: 'Proofs',
            detail: money.waiting ? money.waiting + ' waiting' : 'Sent by resident',
            Icon: FileImage,
            body: <BedProofs {...base} stayId={money.stayId} />,
          },
          ...(money.transport
            ? [
                {
                  key: 'transport',
                  title: 'Transport',
                  detail: 'Route · bill',
                  Icon: Bus,
                  body: <BedTransport {...base} stayId={money.stayId} />,
                },
              ]
            : []),
        ]
      : []),
    {
      key: 'history',
      title: 'History',
      detail: props.upcoming.length ? 'Past · coming next' : 'Who stayed here',
      Icon: History,
      body: (
        <NativeBedHistory
          {...base}
          bedId={props.bedId}
          onOpenStay={props.onOpenStay}
          upcoming={props.upcoming}
          hideTitle
        />
      ),
    },
    {
      key: 'photos',
      title: 'Photos',
      detail: 'Bed pictures',
      Icon: Images,
      body: (
        <OwnerMediaGallery
          {...base}
          roomId={props.roomId}
          bedId={props.bedId}
          title="Bed photos"
          compact
        />
      ),
    },
  ];
  const current = sections.find((section) => section.key === open);
  if (current)
    return (
      <View className="gap-3">
        <AppHeader
          title={current.title}
          backLabel={'Back from ' + current.title.toLowerCase()}
          onBack={() => setOpen(undefined)}
        />
        {current.body}
      </View>
    );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {sections.map((section) => (
        <BedActionTile
          key={section.key}
          Icon={section.Icon}
          title={section.title}
          detail={section.detail}
          label={section.title}
          onPress={() => setOpen(section.key)}
        />
      ))}
    </View>
  );
}
// Money tiles show only for finance_view; counts come from the same Stay-narrowed reads the
// tiles open, so the cache is shared.
function useMoney(actorId: string, branchId: string, stayId: string | null) {
  const access = useQuery({
    queryKey: ['inventory-access', actorId, branchId],
    retry: false,
    queryFn: async () => readInventoryAccess(await actorClient(actorId), branchId),
  });
  const finance = Boolean(stayId) && (access.data?.permissions.includes('finance_view') ?? false);
  const proofs = useQuery({
    queryKey: ['payment-proof-queue', actorId, branchId, 'stay', stayId],
    enabled: finance,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      branchPaymentProofQueue(await actorClient(actorId), branchId, { stayId, limit: 10 }),
  });
  const transport = useQuery({
    queryKey: ['branch-transport', actorId, branchId, 'stay', stayId],
    enabled: finance,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readBranchTransport(await actorClient(actorId), branchId, { stayId, limit: 5 }),
  });
  return {
    stayId: finance ? stayId : null,
    waiting: proofs.data?.data.filter((row) => row.proof.state === 'submitted').length ?? 0,
    transport: Boolean(transport.data?.data.length),
  };
}

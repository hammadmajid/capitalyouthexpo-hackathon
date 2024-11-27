import { AgreementDocuments } from './agreement-documents';
import { AgreementAcknowledgement } from './agreement-acknowledgement';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { AppHeader } from './navigation/header';
import { BedActionTile } from './bed-action-tile';
import { View } from 'react-native';
import { useInfiniteQuery } from '@tanstack/react-query';
import { formatDate, type StayRecord } from '@hsm/contracts';
import { marketplacePrice, readOwnStayRecord, readStaffStayRecord } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { InvFact } from './inventory-tools';
import { PriceSection } from './price-form-parts';
import {
  Banknote,
  BedDouble,
  BadgeCheck,
  Camera,
  CalendarClock,
  CircleDot,
  FileText,
  History,
  MapPin,
  Receipt,
  ScrollText,
  ShieldCheck,
} from 'lucide-react-native';
import { MarketplaceAction as Button } from './marketplace/action';
const words = (value: string) => value.replaceAll('_', ' ');
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);
// STAY-002 / RES-005: original agreement, accommodation and lifecycle history from the
// server (staff with stay_manage, or the linked account for its own Stay).
export function NativeStayRecord(props: {
  actorId: string;
  stayId: string;
  branchId?: string;
  // Lets a parent hide its own header while a sub-panel shows its Back (one Back on screen).
  onPanelChange?: (open: boolean) => void;
}) {
  const [panel, setPanelState] = useState<{ id: string; kind: 'files' | 'rules' }>();
  const setPanel = (next: { id: string; kind: 'files' | 'rules' } | undefined) => {
    setPanelState(next);
    props.onPanelChange?.(next !== undefined);
  };
  const record = useInfiniteQuery({
    queryKey: ['stay-record', props.actorId, props.branchId ?? 'own', props.stayId, 'pages'],
    gcTime: 0,
    retry: false,
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }): Promise<StayRecord> => {
      const client = await actorClient(props.actorId);
      const query = pageParam === undefined ? {} : { beforeAgreementVersion: pageParam };
      return props.branchId
        ? readStaffStayRecord(client, props.branchId, props.stayId, query)
        : readOwnStayRecord(client, props.stayId, query);
    },
    getNextPageParam: (page) => page.nextAgreementBeforeVersion,
  });
  if (record.isPending) return <Skeleton kind="details" label="Loading agreement and history…" />;
  if (record.isError)
    return (
      <View className="gap-2">
        <Copy alert>{safeMessage(record.error)}</Copy>
      </View>
    );
  const data = record.data.pages[0];
  if (!data) return null;
  const agreements = record.data.pages.flatMap((page) => page.agreements);
  const current = agreements.find((row) => row.id === panel?.id);
  const target = (agreementId: string) => ({
    stayId: props.stayId,
    agreementId,
    ...(props.branchId ? { branchId: props.branchId } : {}),
  });
  // One sub-panel at a time: scans or rules for one agreement, with its own Back.
  if (panel && current)
    return (
      <View className="gap-3">
        <AppHeader
          title={panel.kind === 'files' ? 'Agreement photos' : 'Agreement rules'}
          backLabel={panel.kind === 'files' ? 'Hide agreement documents' : 'Hide agreement policy'}
          onBack={() => setPanel(undefined)}
        />
        {panel.kind === 'files' ? (
          <AgreementDocuments
            actorId={props.actorId}
            target={target(current.id)}
            templateFileId={current.terms.policy.agreementTemplate?.fileId}
            embedded
          />
        ) : (
          <AgreementAcknowledgement
            actorId={props.actorId}
            stayId={props.stayId}
            agreement={current}
            own={props.branchId === undefined}
            embedded
          />
        )}
      </View>
    );
  return (
    <View
      className="gap-3"
      accessible={false}
      accessibilityLabel={'Stay record · Hostel branch: ' + data.branch.name}
    >
      {agreements.map((agreement) => (
        <PriceSection
          key={agreement.id}
          Icon={FileText}
          title="Terms"
          note={
            (agreement.version > 1 ? 'Version ' + agreement.version + ' · ' : '') +
            'From ' +
            formatDate(agreement.effectiveFrom + 'T00:00:00.000Z')
          }
        >
          <InvFact Icon={Banknote}>
            Rent {marketplacePrice(agreement.terms.rentAmountPaisa)}
          </InvFact>
          <InvFact Icon={ShieldCheck}>
            Deposit {marketplacePrice(agreement.terms.depositPaisa)}
          </InvFact>
          {agreement.terms.fees.map((fee) => (
            <InvFact key={fee.code + ':' + fee.cadence} Icon={Receipt}>
              {words(fee.code)} {marketplacePrice(fee.amountPaisa)} ·{' '}
              {fee.cadence === 'monthly' ? 'monthly' : 'one time'}
            </InvFact>
          ))}
          <InvFact Icon={CalendarClock}>
            Notice {agreement.terms.policy.noticeDays} days · Grace{' '}
            {agreement.terms.policy.graceDays} days
          </InvFact>
          {agreement.acknowledgements?.length ? (
            <InvFact Icon={BadgeCheck}>
              Acknowledged {formatDate(agreement.acknowledgements[0]?.acceptedAt ?? '')}
            </InvFact>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <BedActionTile
              Icon={Camera}
              title="Photos"
              label="Agreement documents"
              onPress={() => setPanel({ id: agreement.id, kind: 'files' })}
            />
            <BedActionTile
              Icon={ScrollText}
              title="Rules"
              label="Review agreement policy"
              onPress={() => setPanel({ id: agreement.id, kind: 'rules' })}
            />
          </View>
        </PriceSection>
      ))}
      {record.hasNextPage ? (
        <Button
          secondary
          label="Older agreement versions"
          disabled={record.isFetchingNextPage}
          onPress={() => void record.fetchNextPage()}
        />
      ) : null}
      <PriceSection Icon={BedDouble} title="Bed">
        {data.assignments.map((assignment) => (
          <InvFact key={assignment.id} Icon={assignment.endedAt ? History : MapPin}>
            Room {assignment.roomLabel}
            {assignment.bedLabel ? ' · Bed ' + assignment.bedLabel : ' · Whole room'} ·{' '}
            {assignment.endedAt
              ? formatDate(assignment.startedAt) + ' – ' + formatDate(assignment.endedAt)
              : 'since ' + formatDate(assignment.startedAt)}
          </InvFact>
        ))}
      </PriceSection>
      <PriceSection Icon={History} title="Timeline">
        {data.history.map((entry) => (
          <InvFact key={entry.id} Icon={CircleDot}>
            {formatDate(entry.createdAt)} ·{' '}
            {entry.previousState ? cap(words(entry.previousState)) + ' → ' : ''}
            {cap(words(entry.nextState))}
          </InvFact>
        ))}
      </PriceSection>
      {data.truncated ? <Copy>Showing the latest 50</Copy> : null}
    </View>
  );
}

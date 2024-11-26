import { BedDouble, Receipt } from 'lucide-react-native';
import { mobileColors as colors } from '@hsm/ui';
import { InvFact, StatusDot } from './inventory-tools';
import { useToolOpen } from './inventory-tools';
import { AppHeader } from './navigation/header';
import { Skeleton } from './loading/skeleton';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { rentBoardMonthSchema, type RentBoardState } from '@hsm/contracts';
import { marketplacePrice, readRentBoard } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { safeMessage } from '../lib/messages';
import { Copy } from './ui';
import { MarketplaceAction as Button } from './marketplace/action';
// RB-001/002: written management states from the server; unpaid but within grace is neutral.
const labels: Record<RentBoardState, string> = {
  proof_pending: 'Action needed: proof pending review',
  overdue: 'Overdue',
  partially_paid: 'Partially paid',
  issued: 'Issued (not yet overdue)',
  paid: 'Paid',
  no_charge: 'No charge',
  voided: 'Voided',
  not_billed: 'Not billed this month',
};
// RB-004: mounted only for a live finance_view grant; the server re-checks every read.
export function NativeRentBoard({ actorId, branchId }: { actorId: string; branchId: string }) {
  const [open, setOpen] = useToolOpen(),
    [draft, setDraft] = useState(''),
    [month, setMonth] = useState(''),
    [cursor, setCursor] = useState<string>();
  const board = useQuery({
    queryKey: ['rent-board', actorId, branchId, month, cursor],
    enabled: open,
    gcTime: 0,
    retry: false,
    queryFn: async () =>
      readRentBoard(await actorClient(actorId), branchId, {
        ...(month ? { month } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  if (!open) return <Button secondary label="View Rent Board" onPress={() => setOpen(true)} />;
  const page = board.data;
  const valid = draft.trim() === '' || rentBoardMonthSchema.safeParse(draft.trim()).success;
  return (
    <View className="gap-2" accessibilityLabel="Rent Board">
      <AppHeader title="Rent Board" backLabel="Close Rent Board" onBack={() => setOpen(false)} />
      <TextInput
        accessibilityLabel="Billing month (YYYY-MM, blank for current)"
        placeholder="Month YYYY-MM (current if blank)"
        placeholderTextColor={colors.secondary}
        value={draft}
        onChangeText={setDraft}
        maxLength={7}
        className="min-h-12 rounded-input border border-border bg-inputSurface px-4 py-3 font-body text-body text-text"
      />
      {!valid ? <Copy alert>Enter the month as YYYY-MM.</Copy> : null}
      <Button
        secondary
        label="Show billing month"
        disabled={!valid || board.isFetching}
        onPress={() => {
          setMonth(draft.trim());
          setCursor(undefined);
        }}
      />
      {board.isPending ? <Skeleton kind="list" label="Loading Rent Board…" /> : null}
      {board.isError ? <Copy alert>{safeMessage(board.error)}</Copy> : null}
      {page ? (
        <View className="gap-2">
          <Copy>Billing month {page.month}</Copy>
          {page.data.length === 0 ? <Copy>No stays this month</Copy> : null}
          {page.data.map((row) => (
            <View
              key={row.stayId}
              accessible
              accessibilityLabel={
                row.displayName +
                (row.roomLabel ? ' · Room ' + row.roomLabel : '') +
                (row.bedLabel ? ', Bed ' + row.bedLabel : '') +
                ': ' +
                labels[row.state]
              }
              className="gap-2 rounded-input border border-border bg-icy p-3"
            >
              <View className="flex-row items-center justify-between gap-2">
                <Text className="flex-1 font-heading text-body text-text">{row.displayName}</Text>
                <StatusDot status={row.state} text={labels[row.state]} />
              </View>
              {row.roomLabel ? (
                <InvFact Icon={BedDouble}>
                  {'Room ' + row.roomLabel + (row.bedLabel ? ' · Bed ' + row.bedLabel : '')}
                </InvFact>
              ) : null}
              {row.invoices.map((invoice) => (
                <InvFact key={invoice.invoiceId} Icon={Receipt}>
                  {invoice.invoiceNumber}: due {invoice.dueDate} · outstanding{' '}
                  {marketplacePrice(invoice.outstandingPaisa)} of{' '}
                  {marketplacePrice(invoice.totalPaisa)} · {labels[invoice.state]}
                </InvFact>
              ))}
            </View>
          ))}
          {page.nextCursor ? (
            <Button
              secondary
              label="Next Stays"
              onPress={() => setCursor(page.nextCursor ?? undefined)}
            />
          ) : null}
          {cursor ? (
            <Button secondary label="First Stays" onPress={() => setCursor(undefined)} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

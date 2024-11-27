import { Skeleton } from './loading/skeleton';
import { useState, useEffect, useRef } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, Receipt } from 'lucide-react-native';
import { marketplacePrice } from '@hsm/api-client';
import { StatusDot } from './inventory-tools';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import { formatDate, type ResidentInvoiceBalance } from '@hsm/contracts';
import { useStayInvoices } from './use-stay-invoices';
import { BillReissue } from './bill-reissue';
import { safeMessage } from '../lib/messages';
import { Button, Copy } from './ui';
import { FinancialDocument } from './financial-document';
import { invoiceDocument } from '../lib/financial-document';
type Props = {
  actorId: string;
  branchId?: string;
  stayId: string;
  canView: boolean;
  // Open the newest bill on first load so its status and amount show without a tap.
  openLatest?: boolean;
};
type State = ReturnType<typeof useStayInvoices>;
export function StayInvoices(props: Props) {
  return (
    <Invoices
      key={props.actorId + ':' + (props.branchId ?? 'own') + ':' + props.stayId}
      {...props}
    />
  );
}
function Invoices(props: Props) {
  const [cursor, setCursor] = useState<string>(),
    [selected, setSelected] = useState<string>();
  // FIN-001: bills show straight away inside Rent and payments; no open/close step.
  const state = useStayInvoices(props, true, cursor, selected);
  // SEC-003: after a failure, the next successful reload (a pull) closes the open invoice, so
  // a failing detail never strands the list and private detail is not shown again unasked.
  const failed = useRef(false);
  if (state.error) failed.current = true;
  const loadedAt = state.page.dataUpdatedAt;
  const opened = useRef(false);
  const latest = state.page.data?.data.at(-1)?.invoiceId;
  useEffect(() => {
    if (!props.openLatest || opened.current || !latest) return;
    opened.current = true;
    setSelected(latest);
  }, [props.openLatest, latest]);
  useEffect(() => {
    if (failed.current && !state.page.error) {
      failed.current = false;
      setSelected(undefined);
    }
  }, [loadedAt, state.page.error]);
  if (!props.canView) return null;
  return (
    <View accessibilityLabel="Stay invoices" className="gap-2">
      <InvoiceContent
        state={state}
        selected={selected}
        onSelect={(id) => setSelected(id === selected ? undefined : id)}
        scope={props}
      />
      {state.fresh && !state.error ? (
        <InvoicePages
          state={state}
          hasPrevious={Boolean(cursor)}
          onFirst={() => {
            setSelected(undefined);
            setCursor(undefined);
          }}
          onNext={() => {
            setSelected(undefined);
            setCursor(state.page.data?.nextCursor ?? undefined);
          }}
        />
      ) : null}
    </View>
  );
}
function InvoiceContent({
  state,
  selected,
  onSelect,
  scope,
}: {
  state: State;
  selected: string | undefined;
  onSelect: (id: string) => void;
  scope: Scope;
}) {
  if (state.error)
    return (
      <>
        <Copy alert>{safeMessage(state.error)}</Copy>
      </>
    );
  if (!state.fresh) return <Skeleton kind="list" label="Loading invoices…" />;
  if (!state.page.data?.data.length) return <Copy>No bills yet</Copy>;
  return (
    <>
      {state.page.data.data.map((row) => (
        <InvoiceRow
          key={row.invoiceId}
          row={row}
          open={row.invoiceId === selected}
          state={state}
          scope={scope}
          onPress={() => onSelect(row.invoiceId)}
        />
      ))}
    </>
  );
}
function InvoicePages({
  state,
  hasPrevious,
  onFirst,
  onNext,
}: {
  state: State;
  hasPrevious: boolean;
  onFirst: () => void;
  onNext: () => void;
}) {
  return (
    <>
      {state.page.data?.nextCursor ? <Button label="Next invoices" onPress={onNext} /> : null}
      {hasPrevious ? <Button secondary label="First invoices" onPress={onFirst} /> : null}
    </>
  );
}
type Row = NonNullable<State['page']['data']>['data'][number];
type Scope = Pick<Props, 'actorId' | 'branchId' | 'stayId'>;
// One card per bill; tapping it shows its balance inside the same card (no duplicate).
function InvoiceRow(props: {
  row: Row;
  open: boolean;
  state: State;
  scope: Scope;
  onPress: () => void;
}) {
  const { row, state } = props;
  const [exporting, setExporting] = useState(false);
  const balance = props.open && state.visibleId === row.invoiceId ? state.detail.data : undefined;
  const Chevron = props.open ? ChevronDown : ChevronRight;
  return (
    <View
      style={mobileSurfaces.icyCard}
      className="gap-2 rounded-input border border-border p-3 frosted-card"
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'View invoice ' + row.invoiceNumber}
        accessibilityState={{ expanded: props.open }}
        onPress={props.onPress}
        className="flex-row items-center gap-3"
      >
        <Receipt size={22} color={colors.primary} />
        <Text className="flex-1 font-heading text-body text-heading">
          Bill · {formatDate(row.dueDate + 'T00:00:00.000Z')}
        </Text>
        {balance ? (
          <StatusDot
            status={tone[balance.state] ?? balance.state}
            text={labels[balance.state] ?? balance.state}
          />
        ) : row.documentState === 'voided' ? (
          <Text className="font-body text-sm text-secondary">Voided</Text>
        ) : null}
        <Chevron size={20} color={colors.primary} />
      </Pressable>
      {props.open && (state.detail.isPending || state.detail.isFetching) ? (
        <Skeleton kind="inline" label="Loading invoice balance…" />
      ) : null}
      {balance ? <InvoiceBalance value={balance} /> : null}
      {balance ? (
        <Button
          secondary
          label={'Download invoice ' + row.invoiceNumber}
          onPress={() => setExporting(!exporting)}
        />
      ) : null}
      {balance && exporting ? <FinancialDocument document={invoiceDocument(balance)} /> : null}
      {balance ? <BillReissue {...props.scope} balance={balance} /> : null}
    </View>
  );
}
function amount(value: number) {
  return marketplacePrice(value);
}
const labels: Record<ResidentInvoiceBalance['state'], string> = {
  issued: 'Due',
  partially_paid: 'Part paid',
  paid: 'Paid',
  overdue: 'Overdue',
  no_charge: 'No charge',
  voided: 'Voided',
};
// Rent tones: red overdue, gold part-paid, green only for paid (BED-001).
const tone: Record<string, string> = {
  overdue: 'overdue',
  partially_paid: 'partially_paid',
  paid: 'paid',
  issued: 'issued',
};
// BED-001 / non-negotiable 3: the state comes from the server; only receipt-backed
// allocations count as paid, so a proof alone never turns a bill green.
function InvoiceBalance({ value }: { value: ResidentInvoiceBalance }) {
  return (
    <View accessibilityLabel="Current invoice balance" className="gap-1 pl-9">
      <Text
        className="font-heading text-subtitle"
        style={{ color: value.outstandingPaisa > 0 ? colors.dangerText : colors.success }}
      >
        {value.outstandingPaisa > 0 ? 'Due ' + amount(value.outstandingPaisa) : 'Nothing due'}
      </Text>
      <Text className="font-body text-sm text-secondary">
        {[
          'Bill ' + amount(value.totalPaisa),
          value.debitAdjustmentsPaisa ? '+' + amount(value.debitAdjustmentsPaisa) : null,
          value.creditAdjustmentsPaisa ? '−' + amount(value.creditAdjustmentsPaisa) : null,
          'Paid ' + amount(value.allocatedPaisa),
          value.graceDays ? 'Grace ' + value.graceDays + ' days' : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </View>
  );
}

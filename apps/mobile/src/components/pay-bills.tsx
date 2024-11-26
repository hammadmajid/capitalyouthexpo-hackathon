import { Pressable, Text, View } from 'react-native';
import {
  AlarmClock,
  BedDouble,
  Bus,
  CheckSquare,
  Receipt,
  Square,
  UtensilsCrossed,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  marketplacePrice,
  readCustomerStayInvoice,
  readCustomerStayInvoices,
  readStayTransport,
} from '@hsm/api-client';
import { formatDate, type StayInvoiceKind } from '@hsm/contracts';
import { mobileColors as c, mobileSurfaces } from '@hsm/ui';
import { actorClient } from '../lib/runtime';
const OPEN = ['issued', 'partially_paid', 'overdue'];
export type OpenBill = {
  invoiceId: string;
  number: string;
  dueDate: string;
  outstandingPaisa: number;
  overdue: boolean;
  kind: StayInvoiceKind;
  label?: string | undefined;
};
// CHG-050: each bill named and drawn by what it is for.
export const billKinds: Record<StayInvoiceKind, { name: string; Icon: LucideIcon }> = {
  rent: { name: 'Rent', Icon: BedDouble },
  mess: { name: 'Mess', Icon: UtensilsCrossed },
  utilities: { name: 'Utilities', Icon: Zap },
  admission: { name: 'Admission fee', Icon: Receipt },
  custom: { name: 'Other charge', Icon: Receipt },
  late_fee: { name: 'Late fee', Icon: AlarmClock },
  transport: { name: 'Transport', Icon: Bus },
  mixed: { name: 'Bill', Icon: Receipt },
};
// CHG-050: every bill of the resident's own Stay that still has something owed, oldest due
// first, each with its exact server balance; transport bills are marked from the resident's
// own transport subscription when the server does not say (older bills).
export function useOpenBills(actorId: string, stayId: string, enabled: boolean) {
  const refs = useQuery({
    queryKey: ['own-invoice-references', actorId, stayId],
    enabled,
    gcTime: 0,
    queryFn: async () =>
      readCustomerStayInvoices(await actorClient(actorId), stayId, { limit: 20 }),
  });
  const transport = useQuery({
    queryKey: ['own-transport', actorId, stayId, 'bills'],
    enabled,
    gcTime: 0,
    retry: false,
    queryFn: async () => readStayTransport(await actorClient(actorId), stayId),
  });
  const issued = (refs.data?.data ?? []).filter((row) => row.documentState === 'issued');
  const balances = useQueries({
    queries: issued.map((row) => ({
      queryKey: ['own-invoice-balance', actorId, stayId, row.invoiceId],
      enabled,
      gcTime: 0,
      queryFn: async () =>
        readCustomerStayInvoice(await actorClient(actorId), stayId, row.invoiceId),
    })),
  });
  const transportBills = new Set(
    (transport.data?.data ?? []).flatMap((row) => (row.billing ? [row.billing.invoiceId] : [])),
  );
  const bills: OpenBill[] = issued
    .flatMap((row, index) => {
      const balance = balances[index]?.data;
      if (!balance || !OPEN.includes(balance.state)) return [];
      return [
        {
          invoiceId: row.invoiceId,
          number: row.invoiceNumber,
          dueDate: row.dueDate,
          outstandingPaisa: balance.outstandingPaisa,
          overdue: balance.state === 'overdue',
          label: balance.lineItems
            ?.map((line) => billKinds[line.kind].name)
            .filter((name, index, names) => names.indexOf(name) === index)
            .join(' + '),
          kind: row.kind ?? (transportBills.has(row.invoiceId) ? 'transport' : 'rent'),
        },
      ];
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return {
    bills,
    loading: refs.isPending || balances.some((query) => query.isPending),
    error: refs.error ?? balances.find((query) => query.error)?.error ?? null,
  };
}
// One tick row per open bill: icon (rent or transport), due date, amount owed.
export function PayBills(props: {
  bills: OpenBill[];
  chosen: string[];
  onChange: (chosen: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }} accessibilityLabel="Bills to pay">
      {props.bills.map((bill) => {
        const on = props.chosen.includes(bill.invoiceId);
        const { Icon: Kind } = billKinds[bill.kind];
        const name = bill.label || billKinds[bill.kind].name;
        const Tick = on ? CheckSquare : Square;
        return (
          <Pressable
            key={bill.invoiceId}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: Boolean(props.disabled) }}
            accessibilityLabel={
              name + ', due ' + bill.dueDate + ', ' + marketplacePrice(bill.outstandingPaisa)
            }
            disabled={props.disabled}
            onPress={() =>
              props.onChange(
                on
                  ? props.chosen.filter((value) => value !== bill.invoiceId)
                  : [...props.chosen, bill.invoiceId],
              )
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View
              style={[
                mobileSurfaces.icyCard,
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderWidth: 1,
                  borderRadius: 16,
                  padding: 14,
                },
              ]}
            >
              <Tick color={c.primary} size={24} />
              <Kind color={c.primary} size={22} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text className="font-heading" style={{ color: c.heading, fontSize: 16 }}>
                  {name}
                </Text>
                <Text
                  className="font-body"
                  style={{ color: bill.overdue ? c.dangerText : c.secondary, fontSize: 13 }}
                >
                  {(bill.overdue ? 'Overdue · ' : 'Due ') +
                    formatDate(bill.dueDate + 'T00:00:00.000Z')}
                </Text>
              </View>
              <Text className="font-heading" style={{ color: c.heading, fontSize: 16 }}>
                {marketplacePrice(bill.outstandingPaisa)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

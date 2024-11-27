import type { ResidentInvoiceBalance } from '@hsm/contracts';
import { marketplacePrice } from '@hsm/api-client';
import { mobileColors as c, mobileOwnerColors as owner } from '@hsm/ui';
import { CalendarDays } from 'lucide-react-native';
import { Text, View } from 'react-native';
import { ResidentGlassCorners, residentStyles as s } from './resident-detail-ui';
type Props = { invoices: ResidentInvoiceBalance[]; truncated: boolean };
const labels: Record<ResidentInvoiceBalance['state'], string> = {
  issued: 'Issued',
  partially_paid: 'Part paid',
  overdue: 'Overdue',
  paid: 'Paid',
  no_charge: 'No charge',
  voided: 'Voided',
};
function BillRow({ bill, first }: { bill: ResidentInvoiceBalance; first: boolean }) {
  const month = new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Karachi',
  }).format(new Date(bill.dueDate + 'T00:00:00.000Z'));
  const paid = bill.state === 'paid';
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderTopWidth: first ? 0 : 1,
        borderColor: c.border,
        paddingVertical: 6,
      }}
    >
      <CalendarDays size={20} color={c.primary} />
      <Text style={[s.value, { flex: 1, fontSize: 12, lineHeight: 18 }]}>{month + ' · Bill'}</Text>
      <View
        style={{
          backgroundColor: paid
            ? c.aqua
            : bill.state === 'voided' || bill.state === 'no_charge'
              ? c.icy
              : owner.dueSurface,
          borderRadius: 14,
          paddingHorizontal: 8,
          paddingVertical: 2,
        }}
      >
        <Text
          style={[
            s.value,
            {
              color: paid
                ? c.primary
                : bill.state === 'voided' || bill.state === 'no_charge'
                  ? c.secondary
                  : owner.dueText,
              fontSize: 11,
              lineHeight: 16,
            },
          ]}
        >
          {labels[bill.state]}
        </Text>
      </View>
      <Text style={[s.value, { flex: 1, textAlign: 'right', fontSize: 13, lineHeight: 18 }]}>
        {marketplacePrice(bill.totalPaisa)}
      </Text>
    </View>
  );
}
export function StaffStayRecentBills({ invoices, truncated }: Props) {
  const recent = [...invoices]
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.invoiceId.localeCompare(a.invoiceId))
    .slice(0, 3);
  return (
    <View accessibilityLabel="Recent resident bills" style={[s.inset, { paddingVertical: 3 }]}>
      <ResidentGlassCorners />
      {recent.length ? (
        recent.map((bill, index) => (
          <BillRow key={bill.invoiceId} bill={bill} first={index === 0} />
        ))
      ) : (
        <Text style={[s.muted, { paddingVertical: 8 }]}>No invoices available</Text>
      )}
      {truncated ? <Text style={s.muted}>More records in View Payments</Text> : null}
    </View>
  );
}

import { Pressable, Text, View } from 'react-native';
import { Circle, CircleCheck } from 'lucide-react-native';
import { marketplacePrice } from '@hsm/api-client';
import { formatDate } from '@hsm/contracts';
import { mobileColors as colors, mobileSurfaces } from '@hsm/ui';
import type { OpenBill } from './payment-plan';
// FIN-001: unpaid bills with what each still owes; tap to include or leave one out.
export function PaymentBills(props: {
  bills: readonly OpenBill[];
  chosen: readonly string[];
  onToggle: (invoiceId: string) => void;
}) {
  if (!props.bills.length)
    return <Text className="font-body text-sm text-secondary">No unpaid bills</Text>;
  return (
    <View className="gap-2">
      {props.bills.map((bill) => {
        const on = props.chosen.includes(bill.invoiceId);
        const Mark = on ? CircleCheck : Circle;
        const due = formatDate(bill.dueDate + 'T00:00:00.000Z');
        return (
          <Pressable
            key={bill.invoiceId}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={'Pay bill due ' + due}
            onPress={() => props.onToggle(bill.invoiceId)}
            style={mobileSurfaces.icyCard}
            className="flex-row items-center gap-3 rounded-input border border-border p-3 frosted-card"
          >
            <Mark size={22} color={on ? colors.primary : colors.secondary} />
            <View className="flex-1">
              <Text className="font-heading text-body text-heading">
                {bill.label || 'Bill'} · {due}
              </Text>
              {bill.overdue ? (
                <Text className="font-body text-sm text-dangerText">Overdue</Text>
              ) : null}
            </View>
            <Text className="font-heading text-body text-heading">
              {marketplacePrice(bill.outstandingPaisa)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

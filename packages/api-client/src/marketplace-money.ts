import { moneyFromJson, formatMoney } from '@hsm/contracts';
// Prices remain integer paisa; display retains fractional rupees exactly.
export function marketplacePrice(paisa: number): string {
  const value = moneyFromJson(paisa);
  const fraction = value % 100n;
  return formatMoney(value) + (fraction === 0n ? '' : '.' + String(fraction).padStart(2, '0'));
}

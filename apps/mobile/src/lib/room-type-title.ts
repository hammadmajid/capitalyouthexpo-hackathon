// Early setup saved names such as "2-seater · Rent per bed · PKR 18,000.00". A price or rent
// mode inside a name goes stale when pricing changes, so those parts are dropped on display and
// the live fields (rent, mode) are shown instead.
const generatedPart =
  /^(rent per bed|rent whole room|per bed|whole room|bed or room|(pkr|rs\.?)\s*[\d,.]+)$/i;
export function roomTypeTitle(type: { name: string; capacity: number }) {
  const parts = type.name.split('·').map((part) => part.trim());
  const kept = parts.filter((part) => part && !generatedPart.test(part));
  return kept.join(' · ') || type.capacity + '-seater';
}
// "2 beds · Per bed", or just "Per bed" when the title already says "2-seater".
export function roomTypeFacts(type: { name: string; capacity: number }, mode: string) {
  if (roomTypeTitle(type).startsWith(type.capacity + '-seater')) return mode;
  return type.capacity + (type.capacity === 1 ? ' bed · ' : ' beds · ') + mode;
}

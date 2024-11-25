import type { OccupancyPage } from '@hsm/contracts';
export type BoardRoom = OccupancyPage['data'][number];
export type BoardBed = BoardRoom['beds'][number];
// CHG-048 / BED-001: one colour rule for every bed circle. Green only for a receipt-backed
// paid invoice with nothing open (PAY-008); white only for a bed that can take a resident;
// silver for a reserved bed; light blue while a resident's proof waits for review.
export type BedTone =
  'paid' | 'due' | 'overdue' | 'proof' | 'vacant' | 'reserved' | 'occupied' | 'held' | 'off';
export function bedTone(bed: Pick<BoardBed, 'state' | 'rentStatus'>): BedTone {
  if (bed.state === 'available') return 'vacant';
  if (bed.state === 'unavailable') return 'off';
  if (bed.state === 'reserved') return 'reserved';
  if (bed.state !== 'occupied') return 'held';
  if (bed.rentStatus === 'proof_pending') return 'proof';
  if (bed.rentStatus === 'overdue') return 'overdue';
  if (bed.rentStatus === 'due') return 'due';
  if (bed.rentStatus === 'paid') return 'paid';
  return 'occupied';
}
export const toneLabel: Record<BedTone, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  proof: 'Proof sent',
  vacant: 'Vacant',
  reserved: 'Reserved',
  occupied: 'Occupied',
  held: 'Blocked',
  off: 'Off',
};
// Spoken status for a bed: tone plus the exact occupancy state when it differs.
export function bedStatusText(bed: Pick<BoardBed, 'state' | 'rentStatus'>) {
  const tone = bedTone(bed);
  if (tone === 'paid' || tone === 'due' || tone === 'overdue' || tone === 'proof')
    return 'Occupied, ' + toneLabel[tone];
  if (tone === 'occupied' && bed.rentStatus === 'clear') return 'Occupied, nothing billed yet';
  return toneLabel[tone];
}
// Border and text classes for each tone (token colours only). The label is always shown too,
// so status never depends on colour alone.
export const bedToneClass: Partial<Record<BedTone, string>> = {
  paid: 'border-hsm-success text-hsm-success',
  overdue: 'border-hsm-dangerText text-hsm-dangerText',
  due: 'border-hsm-gold text-hsm-heading',
  proof: 'border-hsm-primary bg-hsm-icy text-hsm-heading',
  reserved: 'border-hsm-muted text-hsm-muted',
};

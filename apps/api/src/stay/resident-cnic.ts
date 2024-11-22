import type { BookingAdmissionCommand, ManualAdmissionCommand } from '@hsm/contracts';
import type { ProtectedCnic } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
// CHG-054 / CHG-004: a resident CNIC is encrypted here, before any database write. The plain
// number is removed from the command, so it never reaches history, audit or idempotency.
export type CnicProtector = (plain: string) => ProtectedCnic;
export function requireProtector(protect: CnicProtector | undefined): CnicProtector {
  if (!protect) throw new DomainError('INTERNAL', 503, 'CNIC protection unavailable');
  return protect;
}
// The manual command without its CNIC, plus the CNIC (if a new resident gave one).
export function splitManualCnic(command: ManualAdmissionCommand) {
  const resident = command.manual.resident;
  if (resident.kind !== 'new' || resident.profile.cnic === undefined)
    return { command, cnic: undefined };
  const { cnic, ...profile } = resident.profile;
  return {
    command: {
      ...command,
      manual: { ...command.manual, resident: { kind: 'new' as const, profile } },
    },
    cnic,
  };
}
export function splitBookingCnic(command: BookingAdmissionCommand) {
  const { cnic, ...rest } = command;
  return { command: rest, cnic };
}
// Idempotency fingerprints use the keyed CNIC hash, never the number itself.
export function cnicFingerprint(cnic: string | undefined, protect: CnicProtector | undefined) {
  return cnic === undefined
    ? {}
    : { cnicHash: requireProtector(protect)(cnic).cnicHash.toString('hex') };
}

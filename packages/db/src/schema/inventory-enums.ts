import { pgEnum } from 'drizzle-orm/pg-core';

export const inventoryMode = pgEnum('inventory_mode_enum', ['per_bed', 'whole_room', 'both']);
export const inventoryStatus = pgEnum('inventory_status_enum', [
  'active',
  'inactive',
  'maintenance',
]);
export const bookingState = pgEnum('booking_state_enum', [
  'pending_request',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
]);
export const bookingDocumentKind = pgEnum('booking_document_kind_enum', [
  'cnic',
  'student_id',
  'admission_proof',
  'employment_proof',
]);
export const bookingDocumentState = pgEnum('booking_document_state_enum', [
  'pending',
  'accepted',
  'rejected',
]);

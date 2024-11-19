import { agreementDigestSchema, agreementAcceptanceSchema } from './agreement-acceptance.js';
import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { inventoryPageQuerySchema, inventoryPageSequenceIsValid } from './inventory-pages.js';
import { stayDirectoryQuerySchema } from './stay-commands.js';
import {
  stayIdentifierSchema as id,
  stayPrivateText,
  staySourceSchema,
  stayStateSchema,
  stayVersionSchema,
} from './stay-values.js';
import { phoneSchema } from './identity.js';
import { billingAgreementTermsSchema } from './billing-policy.js';

export const stayReadQuerySchema = stayDirectoryQuerySchema
  .extend({
    q: stayPrivateText(100).optional(),
    moveInFrom: databaseDateSchema.optional(),
    moveInTo: databaseDateSchema.optional(),
    expectedLeaveFrom: databaseDateSchema.optional(),
    expectedLeaveTo: databaseDateSchema.optional(),
  })
  .refine(
    (value) =>
      (value.moveInFrom === undefined ||
        value.moveInTo === undefined ||
        value.moveInFrom <= value.moveInTo) &&
      (value.expectedLeaveFrom === undefined ||
        value.expectedLeaveTo === undefined ||
        value.expectedLeaveFrom <= value.expectedLeaveTo),
    'Invalid date filter range',
  );
export type StayReadQuery = z.infer<typeof stayReadQuerySchema>;
export const customerStayQuerySchema = inventoryPageQuerySchema.extend({
  state: stayStateSchema.optional(),
});
export type CustomerStayQuery = z.infer<typeof customerStayQuerySchema>;
export const currentStayAssignmentSchema = z
  .object({
    id,
    roomTypeId: id,
    roomId: id,
    bedId: id.nullable(),
    startedAt: instantSchema,
  })
  .strict();
export const staySummarySchema = z
  .object({
    id,
    branchId: id,
    residentId: id,
    displayName: stayPrivateText(120),
    source: staySourceSchema,
    state: stayStateSchema,
    version: stayVersionSchema,
    moveInDate: databaseDateSchema,
    expectedLeaveDate: databaseDateSchema.nullable(),
    checkedInAt: instantSchema.nullable(),
    closedAt: instantSchema.nullable(),
    currentAssignment: currentStayAssignmentSchema.nullable(),
  })
  .strict();
export type StaySummary = z.infer<typeof staySummarySchema>;
export const stayDetailSchema = staySummarySchema
  .extend({
    bookingId: id.nullable(),
    contact: z
      .object({ phone: phoneSchema.nullable(), email: z.string().email().max(254).nullable() })
      .strict(),
  })
  .strict()
  .refine(
    (value) => (value.source === 'booking') === (value.bookingId !== null),
    'Invalid Stay origin',
  );
// RES-002 / SEC-003: bounded private operational data, never a financial or identity-document projection.
export const stayPageSchema = z
  .object({
    data: z.array(staySummarySchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      inventoryPageSequenceIsValid(value.data) &&
      (value.nextCursor === null || value.data.at(-1)?.id === value.nextCursor),
    'Invalid Stay continuation',
  );
export type StayPage = z.infer<typeof stayPageSchema>;
// STAY-002 / RES-005 / BKG-004: the Stay's own lineage. Agreements keep their original
// snapshot (never today's price or policy); history omits actors and private detail.
export const STAY_RECORD_LIMIT = 50;
export const stayAgreementRecordSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    effectiveFrom: databaseDateSchema,
    terms: billingAgreementTermsSchema,
    termsDigest: agreementDigestSchema.optional(),
    acknowledgements: z.array(agreementAcceptanceSchema).max(STAY_RECORD_LIMIT).optional(),
    fromBooking: z.boolean(),
    createdAt: instantSchema,
  })
  .strict();
export const stayAssignmentRecordSchema = z
  .object({
    id,
    roomTypeId: id,
    roomTypeName: z.string(),
    roomId: id,
    roomLabel: z.string(),
    bedId: id.nullable(),
    bedLabel: z.string().nullable(),
    startedAt: instantSchema,
    endedAt: instantSchema.nullable(),
  })
  .strict();
export const stayHistoryRecordSchema = z
  .object({
    id,
    previousState: stayStateSchema.nullable(),
    nextState: stayStateSchema,
    reasonCode: z.string().min(1).max(80),
    createdAt: instantSchema,
  })
  .strict();
export const stayRecordQuerySchema = z
  .object({
    beforeAgreementVersion: z.coerce.number().int().min(1).max(2147483647).optional(),
  })
  .strict();
export type StayRecordQuery = z.infer<typeof stayRecordQuerySchema>;
export const stayRecordSchema = z
  .object({
    stayId: id,
    branch: z.object({ id, name: z.string() }).strict(),
    agreements: z.array(stayAgreementRecordSchema).max(STAY_RECORD_LIMIT),
    nextAgreementBeforeVersion: z.number().int().positive().optional(),
    assignments: z.array(stayAssignmentRecordSchema).max(STAY_RECORD_LIMIT),
    history: z.array(stayHistoryRecordSchema).max(STAY_RECORD_LIMIT),
    // True when any list holds more than STAY_RECORD_LIMIT rows; the newest are returned.
    truncated: z.boolean(),
  })
  .strict();
export type StayRecord = z.infer<typeof stayRecordSchema>;

// RES-004: no public photo identifier or private storage key is disclosed.
export const stayResidentPhotoSchema = z
  .object({ url: z.string().url().nullable(), expiresAt: z.string().datetime().nullable() })
  .strict()
  .refine(
    (value) => (value.url === null) === (value.expiresAt === null),
    'Invalid photo availability',
  );

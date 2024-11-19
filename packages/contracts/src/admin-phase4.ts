import { z } from 'zod';
import { announcementSchema } from './platform-admin.js';
import { institutionInputSchema, placeTypeSchema } from './marketplace.js';
import { stayIdentifierSchema as id } from './stay-values.js';
import { instantSchema } from './dates.js';
const page = { cursor: id.optional(), limit: z.coerce.number().int().min(1).max(50).default(20) };
export const adminAnnouncementQuerySchema = z
  .object({ ...page, status: z.enum(['scheduled', 'sent', 'cancelled']).optional() })
  .strict();
export const adminAnnouncementSchema = announcementSchema
  .extend({ branchIds: z.array(id).max(200), cityId: id.nullable(), createdAt: instantSchema })
  .strict();
export const adminAnnouncementPageSchema = z
  .object({ data: z.array(adminAnnouncementSchema).max(50), nextCursor: id.nullable() })
  .strict();
export const adminInstitutionQuerySchema = z
  .object({
    ...page,
    q: z.string().trim().min(1).max(180).optional(),
    active: z.enum(['all', 'active', 'inactive']).default('all'),
    type: placeTypeSchema.optional(),
  })
  .strict();
export const institutionGovernanceInputSchema = institutionInputSchema
  .extend({
    changeReason: z.string().trim().min(8).max(500),
    reapprove: z.boolean().default(false),
  })
  .strict();
export const institutionUpdateInputSchema = institutionGovernanceInputSchema
  .extend({ expectedRevision: z.string().regex(/^\d{1,19}$/) })
  .strict();
export const adminInstitutionSchema = institutionInputSchema
  .extend({ id, revision: z.string().regex(/^\d{1,19}$/) })
  .strict();
export const adminInstitutionPageSchema = z
  .object({
    data: z.array(adminInstitutionSchema).max(50),
    nextCursor: id.nullable(),
    // CHG-034: active cities, so Admin picks "Islamabad" rather than typing a city id.
    cities: z
      .array(z.object({ id, name: z.string() }).strict())
      .max(100)
      .default([]),
  })
  .strict();
export const institutionHistoryQuerySchema = z
  .object({
    cursor: z
      .string()
      .regex(/^[1-9][0-9]{0,18}$/)
      .optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const institutionHistoryItemSchema = z
  .object({
    revision: z.string().regex(/^[1-9][0-9]{0,18}$/),
    previousRevision: z
      .string()
      .regex(/^[0-9]{1,19}$/)
      .nullable(),
    actorId: id.nullable(),
    createdAt: instantSchema,
    reason: z.string().nullable(),
    before: institutionInputSchema.nullable(),
    after: institutionInputSchema.nullable(),
    changedFields: z
      .array(
        z.enum([
          'name',
          'shortName',
          'cityId',
          'areaId',
          'address',
          'latitude',
          'longitude',
          'aliases',
          'isActive',
          'publicApproved',
        ]),
      )
      .max(10),
    approval: z.enum(['created', 'preserved', 'approved', 'withdrawn', 'reapproved', 'legacy']),
  })
  .strict();
export const institutionHistoryPageSchema = z
  .object({
    data: z.array(institutionHistoryItemSchema).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

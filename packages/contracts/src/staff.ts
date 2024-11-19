import { z } from 'zod';
import { calendarDateSchema, instantSchema } from './dates.js';
import { moneyJsonSchema } from './money.js';
import { pakistaniMobileSchema } from './phone.js';
import { stayIdentifierSchema as id } from './stay-values.js';
// CHG-039 / SRS v2.27: branch staff and record-only monthly salary tracking.
export const staffJobTitleSchema = z.enum([
  'receptionist',
  'security_guard',
  'cleaner',
  'cook',
  'maintenance',
  'supervisor',
  'other',
]);
export const staffStatusSchema = z.enum(['active', 'inactive', 'ended']);
export const staffPaymentMethodSchema = z.enum(['cash', 'bank_transfer', 'mobile_wallet', 'other']);
export const salaryTimingSchema = z.enum(['paid', 'unpaid', 'due', 'overdue']);
const name = z.string().trim().min(2).max(120);
const customTitle = z.string().trim().min(2).max(60);
const positiveMoney = moneyJsonSchema.pipe(z.number().int().positive());
export const monthStartSchema = calendarDateSchema.refine((v) => v.endsWith('-01'), 'Use a month');
const dueDay = z.number().int().min(1).max(28);
function titleRule<
  T extends { jobTitle?: string | undefined; customTitle?: string | null | undefined },
>(value: T, context: z.RefinementCtx) {
  if (value.jobTitle === undefined) return;
  if ((value.jobTitle === 'other') !== Boolean(value.customTitle))
    context.addIssue({ code: 'custom', path: ['customTitle'], message: 'Name the job' });
}
export const staffSalaryTermsInputSchema = z
  .object({ amountPaisa: positiveMoney, dueDay, effectiveFrom: monthStartSchema })
  .strict();
export const staffCreateInputSchema = z
  .object({
    fullName: name,
    phone: pakistaniMobileSchema.optional(),
    jobTitle: staffJobTitleSchema,
    customTitle: customTitle.optional(),
    startsOn: calendarDateSchema,
    // Optional first salary terms (setup step / add form); payroll permission required.
    salary: staffSalaryTermsInputSchema.optional(),
  })
  .strict()
  .superRefine(titleRule);
export const staffUpdateInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    fullName: name.optional(),
    phone: pakistaniMobileSchema.nullable().optional(),
    jobTitle: staffJobTitleSchema.optional(),
    customTitle: customTitle.nullable().optional(),
    startsOn: calendarDateSchema.optional(),
  })
  .strict()
  .superRefine(titleRule);
export const staffStatusInputSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    status: staffStatusSchema,
    endsOn: calendarDateSchema.optional(),
    reason: z.string().trim().min(3).max(300),
  })
  .strict()
  .refine((v) => v.status !== 'ended' || v.endsOn !== undefined, {
    path: ['endsOn'],
    message: 'Choose the last working day',
  });
export const staffIssueInputSchema = z
  .object({ month: monthStartSchema, amountPaisa: moneyJsonSchema })
  .strict();
export const staffPaymentInputSchema = z
  .object({
    amountPaisa: positiveMoney,
    paidOn: calendarDateSchema,
    method: staffPaymentMethodSchema,
    reference: z.string().trim().min(1).max(80).optional(),
    note: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export const staffReversalInputSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();
export const staffAgreementInputSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    body: z.string().trim().min(1).max(5000),
    effectiveOn: calendarDateSchema,
    fileId: id.optional(),
  })
  .strict();
export const staffQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    salary: z.enum(['due']).optional(),
    status: staffStatusSchema.optional(),
    jobTitle: staffJobTitleSchema.optional(),
    month: monthStartSchema.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
export const staffMonthQuerySchema = z.object({ month: monthStartSchema.optional() }).strict();
export const staffSalarySchema = z
  .object({
    id,
    staffId: id,
    month: monthStartSchema,
    amountPaisa: moneyJsonSchema,
    paidPaisa: moneyJsonSchema,
    outstandingPaisa: moneyJsonSchema,
    dueOn: calendarDateSchema,
    timing: salaryTimingSchema,
    partial: z.boolean(),
  })
  .strict();
export const staffMemberSchema = z
  .object({
    id,
    branchId: id,
    fullName: z.string(),
    phone: z.string().nullable(),
    jobTitle: staffJobTitleSchema,
    customTitle: z.string().nullable(),
    startsOn: calendarDateSchema,
    endsOn: calendarDateSchema.nullable(),
    status: staffStatusSchema,
    version: z.number().int().positive(),
    // Present only for actors with staff_payroll_manage (or the Owner).
    salary: staffSalarySchema.nullable(),
  })
  .strict();
export const staffPageSchema = z
  .object({
    data: z.array(staffMemberSchema).max(50),
    nextCursor: id.nullable(),
    payroll: z.boolean(),
  })
  .strict();
export const staffTermsSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    amountPaisa: moneyJsonSchema,
    dueDay,
    effectiveFrom: monthStartSchema,
    createdAt: instantSchema,
  })
  .strict();
export const staffPaymentSchema = z
  .object({
    id,
    salaryId: id,
    kind: z.enum(['payment', 'reversal']),
    amountPaisa: moneyJsonSchema,
    paidOn: calendarDateSchema,
    method: staffPaymentMethodSchema,
    reference: z.string().nullable(),
    note: z.string().nullable(),
    reversesPaymentId: id.nullable(),
    reversed: z.boolean(),
    recordedAt: instantSchema,
  })
  .strict();
export const staffAgreementSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    title: z.string(),
    effectiveOn: calendarDateSchema,
    createdAt: instantSchema,
    // Payroll-only: agreement text, salary terms link and private file presence.
    body: z.string().nullable(),
    termsId: id.nullable(),
    hasFile: z.boolean(),
  })
  .strict();
export const staffDetailSchema = z
  .object({
    staff: staffMemberSchema,
    payroll: z.boolean(),
    terms: z.array(staffTermsSchema).max(100),
    salaries: z.array(staffSalarySchema).max(60),
    payments: z.array(staffPaymentSchema).max(200),
    agreements: z.array(staffAgreementSchema).max(50),
  })
  .strict();
export const staffDashboardSchema = z
  .object({
    branchId: id,
    month: monthStartSchema,
    today: calendarDateSchema,
    activeStaff: z.number().int().nonnegative(),
    payroll: z
      .object({
        paid: z.number().int().nonnegative(),
        unpaid: z.number().int().nonnegative(),
        due: z.number().int().nonnegative(),
        overdue: z.number().int().nonnegative(),
        partial: z.number().int().nonnegative(),
        // Full months the server could not issue alone (mid-month start/end).
        needsAmount: z.number().int().nonnegative(),
        expectedPaisa: moneyJsonSchema,
        paidPaisa: moneyJsonSchema,
        outstandingPaisa: moneyJsonSchema,
        recentPayments: z.array(
          staffPaymentSchema.extend({ staffId: id, staffName: z.string() }).strict(),
        ),
      })
      .strict()
      .nullable(),
  })
  .strict();
export const staffAgreementFileSchema = z
  .object({ url: z.string().url(), expiresAt: instantSchema })
  .strict();
export type StaffMember = z.infer<typeof staffMemberSchema>;
export type StaffDetail = z.infer<typeof staffDetailSchema>;
export type StaffDashboard = z.infer<typeof staffDashboardSchema>;
export type StaffSalary = z.infer<typeof staffSalarySchema>;

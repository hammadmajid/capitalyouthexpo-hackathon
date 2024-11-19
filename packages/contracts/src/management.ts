import { z } from 'zod';
export const managementPageSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export type ManagementPage = z.infer<typeof managementPageSchema>;
export const organizationSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
  })
  .strict();
export const branchSummarySchema = z
  .object({
    id: z.string().uuid(),
    organizationId: z.string().uuid(),
    brandId: z.string().uuid(),
    name: z.string(),
    verificationStatus: z.enum([
      'draft',
      'submitted',
      'under_review',
      'changes_requested',
      'approved',
      'rejected',
      'suspended',
    ]),
  })
  .strict();
export const managerSummarySchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().uuid(),
    branchId: z.string().uuid(),
    fullName: z.string(),
    status: z.enum(['pending_activation', 'active', 'suspended', 'deactivated']),
  })
  .strict();
// AUTH-M-006: removing a Manager (or cancelling an invitation) needs the Owner's own password.
export const managerRemovalSchema = z
  .object({ currentPassword: z.string().min(1).max(128) })
  .strict();
export type ManagerRemoval = z.infer<typeof managerRemovalSchema>;
export const managerSuspensionSchema = z
  .object({
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type ManagerAction = 'suspend' | 'reinstate' | 'deactivate';

export const managerStateSchema = managerSummarySchema.pick({
  id: true,
  branchId: true,
  status: true,
});

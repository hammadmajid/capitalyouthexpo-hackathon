import { z } from 'zod';
import { DomainError } from '@hsm/contracts';
const contextSchema = z
  .object({
    actorId: z.string().uuid(),
    subjectId: z.string().uuid(),
    actorActive: z.boolean(),
    resource: z.enum(['cnic', 'permanent_address', 'private_document', 'private_chat']),
    // These facts must be resolved server-side; never parse them from a client body.
    ownerOrAssignedManager: z.boolean(),
    owningBookingOwner: z.boolean().optional(),
    scopedBookingEvidence: z.boolean().optional(),
    approvedBookingOrWalkIn: z.boolean(),
    rootActive: z.boolean(),
    authorizedSafetyCase: z.boolean(),
    justification: z.string().trim().max(500),
  })
  .strict();
export type SensitiveContext = z.infer<typeof contextSchema>;
export function requireSensitiveAccess(input: SensitiveContext) {
  const context = contextSchema.parse(input);
  if (!context.actorActive) throw new DomainError('FORBIDDEN', 403, 'Sensitive access denied');
  const ownIdentity = context.actorId === context.subjectId && context.resource !== 'private_chat';
  const operationalIdentity =
    context.resource !== 'private_chat' &&
    context.ownerOrAssignedManager &&
    context.approvedBookingOrWalkIn;
  const preConfirmationEvidence =
    context.resource === 'private_document' &&
    context.owningBookingOwner === true &&
    context.scopedBookingEvidence === true;
  const needBasedRoot =
    context.rootActive && context.authorizedSafetyCase && context.justification.length >= 8;
  if (!ownIdentity && !operationalIdentity && !preConfirmationEvidence && !needBasedRoot)
    throw new DomainError('FORBIDDEN', 403, 'Sensitive access denied');
  // Admission is not disclosure: callers must audit in the same transaction as
  // the protected read before returning any value. Task 9 supplies that boundary.
}

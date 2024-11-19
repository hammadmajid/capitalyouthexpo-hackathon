import { z } from 'zod';
import { stayIdentifierSchema as id, stayPrivateText } from './stay-values.js';
export const propertyRenameKindSchema = z.enum(['building', 'floor', 'room', 'seat']);
export const propertyRenameInputSchema = z
  .object({ name: stayPrivateText(120), expectedName: stayPrivateText(120) })
  .strict();
export const propertyRenameResultSchema = z
  .object({ id, branchId: id, kind: propertyRenameKindSchema, name: stayPrivateText(120) })
  .strict();
export type PropertyRenameKind = z.infer<typeof propertyRenameKindSchema>;

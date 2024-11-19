import { z } from 'zod';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
// ROOM-002: no pre-created beds, capacity or room-level admission security.
export const setupRoomInputSchema = z
  .object({ label: stayPrivateText(80), floorId: stayIdentifierSchema })
  .strict();
export type SetupRoomInput = z.infer<typeof setupRoomInputSchema>;

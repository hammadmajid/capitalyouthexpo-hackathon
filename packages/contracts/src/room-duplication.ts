import { z } from 'zod';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const labels = z
  .array(z.string().trim().min(1).max(80))
  .min(1)
  .max(100)
  .refine((value) => new Set(value).size === value.length, 'Room numbers must be unique');
export const roomDuplicationInputSchema = z.union([
  z.object({ roomNumbers: labels }).strict(),
  z
    .object({ from: z.number().int().min(0).max(999999), to: z.number().int().min(0).max(999999) })
    .strict()
    .refine(
      (value) => value.to >= value.from && value.to - value.from < 100,
      'Choose an ascending range of at most 100 rooms',
    ),
]);
export function duplicationRoomNumbers(input: z.infer<typeof roomDuplicationInputSchema>) {
  return 'roomNumbers' in input
    ? [...input.roomNumbers]
    : Array.from({ length: input.to - input.from + 1 }, (_, index) => String(input.from + index));
}
export const roomDuplicationResultSchema = z
  .object({
    branchId: id,
    sourceRoomId: id,
    roomIds: z
      .array(id)
      .min(1)
      .max(100)
      .refine((value) => new Set(value).size === value.length),
  })
  .strict();
export type RoomDuplicationInput = z.infer<typeof roomDuplicationInputSchema>;

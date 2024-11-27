import * as SecureStore from 'expo-secure-store';
import { uploadSchema, stayIdentifierSchema } from '@hsm/contracts';
import { z } from 'zod';
const draftSchema = z
  .object({
    fileId: stayIdentifierSchema,
    upload: uploadSchema,
    previewUri: z.string().optional(),
    createdAt: z.number(),
  })
  .strict();
export type OwnerPhotoDraft = z.infer<typeof draftSchema>;
const key = (userId: string) => 'hsm.owner-photo.' + stayIdentifierSchema.parse(userId);
export async function readOwnerPhotoDraft(userId: string): Promise<OwnerPhotoDraft | undefined> {
  const value = await SecureStore.getItemAsync(key(userId));
  if (!value) return undefined;
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    await clearOwnerPhotoDraft(userId);
    return undefined;
  }
  const result = draftSchema.safeParse(input);
  if (
    !result.success ||
    result.data.upload.purpose !== 'avatar' ||
    Date.now() - result.data.createdAt > 7 * 86400000
  ) {
    await clearOwnerPhotoDraft(userId);
    return undefined;
  }
  return result.data;
}
export function keepOwnerPhotoDraft(userId: string, input: OwnerPhotoDraft) {
  return SecureStore.setItemAsync(key(userId), JSON.stringify(draftSchema.parse(input)));
}
export function clearOwnerPhotoDraft(userId: string) {
  return SecureStore.deleteItemAsync(key(userId));
}

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
// Phone camera photos are often 3-8 MB; a 1600 px JPEG keeps rooms sharp at a few hundred KB,
// so every in-app photo uploads quickly and stays under the 5 MB photo limit.
const longestSide = 1600;
const quality = 0.72;
export const photoMimes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export function isPhotoMime(mime: string | undefined): boolean {
  return photoMimes.some((type) => type === mime);
}
/** Returns the resized cache copy; the caller deletes it after upload. PNG stays PNG so
 * transparent logos keep their background; other photos become JPEG. */
export async function compressPhoto(
  uri: string,
  mimeType: string,
): Promise<{ uri: string; mimeType: 'image/jpeg' | 'image/png' }> {
  const png = mimeType === 'image/png';
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = original;
  const context = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > longestSide)
    context.resize(width >= height ? { width: longestSide } : { height: longestSide });
  const image = await context.renderAsync();
  const result = await image.saveAsync(
    png ? { format: SaveFormat.PNG } : { compress: quality, format: SaveFormat.JPEG },
  );
  return { uri: result.uri, mimeType: png ? 'image/png' : 'image/jpeg' };
}
export function photoName(name: string, mimeType: 'image/jpeg' | 'image/png'): string {
  const base = name.replace(/\.[^.]*$/, '').slice(0, 170) || 'photo';
  return base + (mimeType === 'image/png' ? '.png' : '.jpg');
}

import { z } from 'zod';
import { getDocumentAsync } from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { fetch as nativeFetch } from 'expo/fetch';
import { uploadSchema, type Upload } from '@hsm/contracts';
import { uploadPrivateFile, UploadFailure, ClientFailure, type ApiClient } from '@hsm/api-client';
import { timedFetch } from './fetch';
const UPLOAD_TIMEOUT_MS = 180_000;
import { compressPhoto, isPhotoMime, photoName } from './photo-compress';
export class PendingDocumentUpload extends UploadFailure {
  constructor(
    fileId: string,
    readonly upload: Upload,
  ) {
    super('PENDING', fileId);
  }
}
function selectedCacheFile(uri: string) {
  const root = new URL(Paths.cache.uri),
    selected = new URL(uri);
  const prefix = root.href.endsWith('/') ? root.href : root.href + '/';
  if (selected.protocol !== 'file:' || !selected.href.startsWith(prefix))
    throw new ClientFailure('INVALID_RESPONSE');
  return new File(selected.href);
}
function removeCacheCopy(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    throw new ClientFailure('INVALID_RESPONSE');
  }
}
/** The system picker owns the source; only its app-cache copy is read and deleted. */
export async function uploadSelectedDocument(
  client: ApiClient,
  purpose:
    | 'avatar'
    | 'verification_document'
    | 'listing_photo'
    | 'resident_document'
    | 'agreement_template'
    | 'stay_agreement'
    | 'payment_proof'
    | 'chat_attachment'
    | 'complaint_attachment'
    | 'staff_agreement'
    | 'import',
  onSelected: (uri: string, mimeType?: string) => void,
  options: { imagesOnly?: boolean } = {},
): Promise<string | undefined> {
  const result = await getDocumentAsync({
    type: options.imagesOnly
      ? ['image/jpeg', 'image/png']
      : purpose === 'import'
        ? ['text/csv']
        : purpose === 'avatar' || purpose === 'listing_photo'
          ? ['image/jpeg', 'image/png', 'image/webp']
          : ['image/jpeg', 'image/png', 'application/pdf'],
    multiple: false,
    copyToCacheDirectory: true,
  });
  if (result.canceled) return undefined;
  const asset = result.assets[0];
  if (!asset) throw new ClientFailure('INVALID_RESPONSE');
  const picked = selectedCacheFile(asset.uri);
  const mimeType = purpose === 'import' ? 'text/csv' : (asset.mimeType ?? picked.type);
  let file = picked,
    upload: Upload | undefined;
  try {
    if (options.imagesOnly) z.enum(['image/jpeg', 'image/png']).parse(mimeType);
    onSelected(asset.uri, mimeType);
    // Every photo is shrunk first, so uploads are fast and stay under the 5 MB photo limit.
    const photo = isPhotoMime(mimeType) ? await compressPhoto(asset.uri, mimeType) : undefined;
    if (photo) file = selectedCacheFile(photo.uri);
    upload = uploadSchema.parse({
      purpose,
      fileName: photo ? photoName(asset.name, photo.mimeType) : asset.name,
      mimeType: photo ? photo.mimeType : mimeType,
      sizeBytes: photo ? file.size : (asset.size ?? file.size),
    });
    // A 10 MB CNIC/proof/agreement on a slow 3G link needs minutes, not the 10 s API default.
    return await uploadPrivateFile(client, upload, file, {
      transport: timedFetch(nativeFetch, UPLOAD_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof UploadFailure && error.code === 'PENDING' && upload)
      throw new PendingDocumentUpload(error.fileId, upload);
    throw error;
  } finally {
    removeCacheCopy(picked);
    if (file !== picked) removeCacheCopy(file);
  }
}

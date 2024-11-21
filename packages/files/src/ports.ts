import type { Upload } from '@hsm/contracts';
export interface PrivateStorage {
  presignUpload(key: string, upload: Upload): Promise<string>;
  read(key: string, maximumBytes: number): Promise<Buffer>;
  putVerified(key: string, mimeType: string, bytes: Buffer): Promise<void>;
  presignDownload(key: string, fileId: string, mimeType: string): Promise<string>;
  remove(key: string): Promise<void>;
  close(): void;
}
export interface VirusScanner {
  scan(bytes: Buffer): Promise<'clean' | 'rejected'>;
}

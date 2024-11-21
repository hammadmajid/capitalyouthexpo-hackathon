import type { Upload } from '@hsm/contracts';
import type { ScanFile } from '@hsm/files';
import type { Actor } from '../authorization/store.js';
export type FileRecord = ScanFile & { sha256: Buffer | null };
export interface FileTransaction {
  read(id: string): Promise<FileRecord>;
  create(id: string, key: string, upload: Upload): Promise<void>;
  queue(file: FileRecord): Promise<void>;
  reject(file: FileRecord): Promise<void>;
  acceptAvatar(file: FileRecord, objectKey: string, sha256: Buffer): Promise<void>;
  audit(file: FileRecord): Promise<void>;
}
export interface FileStore {
  transaction<T>(actor: Actor, work: (transaction: FileTransaction) => Promise<T>): Promise<T>;
}

import type { Upload } from '@hsm/contracts';
export interface ScanLease {
  id: string;
  eventType: string;
  channel: string;
  recipientUserId: string | null;
  payload: Record<string, unknown>;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
}
export interface ScanFile {
  id: string;
  uploadedBy: string | null;
  objectKey: string;
  scanStatus: 'pending' | 'clean' | 'rejected';
  upload: Upload;
}
export type ScanResult =
  | { status: 'rejected' }
  | {
      status: 'clean';
      objectKey: string;
      sha256: Buffer;
    };
export interface ScanStore {
  read(id: string): Promise<ScanFile | undefined>;
  complete(
    lease: ScanLease,
    snapshot: ScanFile,
    result: ScanResult | undefined,
    now: Date,
  ): Promise<boolean>;
}
export class InvalidScanJob extends Error {
  constructor() {
    super('INVALID_MESSAGE');
  }
}

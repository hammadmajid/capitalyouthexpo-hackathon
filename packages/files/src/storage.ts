import { Readable } from 'node:stream';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { fileMimeSchema, uploadSchema, type Upload } from '@hsm/contracts';
import { storageConfig, type StorageConfig } from './config.js';
import { storageKey } from './keys.js';
import type { PrivateStorage } from './ports.js';
export class StorageUnavailable extends Error {
  constructor() {
    super('STORAGE_UNAVAILABLE');
  }
}
export class StorageSizeMismatch extends StorageUnavailable {
  readonly code = 'SIZE_MISMATCH';
}
function client(config: StorageConfig, endpoint: string) {
  return new S3Client({
    endpoint,
    region: config.S3_REGION,
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: config.S3_ACCESS_KEY_ID,
      secretAccessKey: config.S3_SECRET_ACCESS_KEY,
    },
  });
}
const maximum = z.number().int().positive().max(10000000);
export class S3Storage implements PrivateStorage {
  private readonly client: S3Client;
  private readonly signer: S3Client;
  private readonly config: StorageConfig;
  constructor(config: StorageConfig, connection?: S3Client, signer?: S3Client) {
    this.config = storageConfig(config);
    this.client = connection ?? client(this.config, this.config.S3_ENDPOINT);
    this.signer =
      signer ?? client(this.config, this.config.S3_PUBLIC_ENDPOINT ?? this.config.S3_ENDPOINT);
  }
  async presignUpload(key: string, input: Upload) {
    const upload = uploadSchema.parse(input);
    storageKey.parse(key);
    if (!key.startsWith('quarantine/')) throw new Error('Upload quarantine required');
    try {
      return await getSignedUrl(
        this.signer,
        new PutObjectCommand({
          Bucket: this.config.S3_PRIVATE_BUCKET,
          Key: key,
          ContentType: upload.mimeType,
          ContentLength: upload.sizeBytes,
          ACL: 'private',
        }),
        { expiresIn: 300, signableHeaders: new Set(['content-type']) },
      );
    } catch {
      throw new StorageUnavailable();
    }
  }
  async read(key: string, maximumBytes: number) {
    storageKey.parse(key);
    maximum.parse(maximumBytes);
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.config.S3_PRIVATE_BUCKET,
          Key: key,
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
      const stream = result.Body;
      if (!(stream instanceof Readable)) throw new StorageUnavailable();
      if (result.ContentLength !== undefined && result.ContentLength > maximumBytes) {
        stream.destroy();
        throw new StorageSizeMismatch();
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const input of stream) {
        const chunk: unknown = input;
        if (!(chunk instanceof Uint8Array)) throw new StorageUnavailable();
        size += chunk.byteLength;
        if (size > maximumBytes) {
          stream.destroy();
          throw new StorageSizeMismatch();
        }
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks, size);
    } catch (error) {
      if (error instanceof StorageSizeMismatch) throw error;
      throw new StorageUnavailable();
    }
  }
  async putVerified(key: string, mimeType: string, bytes: Buffer) {
    storageKey.parse(key);
    fileMimeSchema.parse(mimeType);
    maximum.parse(bytes.length);
    if (!key.startsWith('private/')) throw new Error('Verified private key required');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.S3_PRIVATE_BUCKET,
          Key: key,
          Body: bytes,
          ContentType: mimeType,
          ContentLength: bytes.length,
          ACL: 'private',
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    } catch {
      throw new StorageUnavailable();
    }
  }
  async presignDownload(key: string, fileId: string, mimeType: string) {
    storageKey.parse(key);
    z.string().uuid().parse(fileId);
    fileMimeSchema.parse(mimeType);
    if (!key.startsWith('private/')) throw new Error('Verified private key required');
    try {
      return await getSignedUrl(
        this.signer,
        new GetObjectCommand({
          Bucket: this.config.S3_PRIVATE_BUCKET,
          Key: key,
          ResponseContentDisposition: 'attachment; filename="file-' + fileId + '"',
          ResponseContentType: mimeType,
        }),
        { expiresIn: 60 },
      );
    } catch {
      throw new StorageUnavailable();
    }
  }
  async remove(key: string) {
    storageKey.parse(key);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.config.S3_PRIVATE_BUCKET,
          Key: key,
        }),
        { abortSignal: AbortSignal.timeout(10000) },
      );
    } catch {
      throw new StorageUnavailable();
    }
  }
  close() {
    this.client.destroy();
    this.signer.destroy();
  }
}

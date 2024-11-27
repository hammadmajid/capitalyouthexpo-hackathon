import { z } from 'zod';
export const mobileSessionSchema = z
  .object({
    client: z.literal('mobile'),
    expiresIn: z.literal(600),
    sessionId: z.string().uuid(),
    accessToken: z.string().min(20).max(4096),
    refreshToken: z.string().min(32).max(512),
  })
  .strict();
export type MobileSession = z.infer<typeof mobileSessionSchema>;
export interface CredentialStorage {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  remove(): Promise<void>;
}
const envelopeSchema = z.object({ version: z.literal(1), session: mobileSessionSchema }).strict();
export class SecureStorageFailure extends Error {
  constructor(readonly operation: 'read' | 'write' | 'remove') {
    super('Secure session storage unavailable');
    this.name = 'SecureStorageFailure';
  }
}
export class CredentialVault {
  constructor(private readonly storage: CredentialStorage) {}
  async read(): Promise<MobileSession | undefined> {
    let value: string | null;
    try {
      value = await this.storage.read();
    } catch {
      throw new SecureStorageFailure('read');
    }
    if (value === null) return undefined;
    let parsed: ReturnType<typeof envelopeSchema.safeParse>;
    try {
      parsed = envelopeSchema.safeParse(JSON.parse(value) as unknown);
    } catch {
      await this.clear();
      return undefined;
    }
    if (!parsed.success) {
      await this.clear();
      return undefined;
    }
    return parsed.data.session;
  }
  async save(session: MobileSession) {
    const parsed = mobileSessionSchema.safeParse(session);
    if (!parsed.success) throw new Error('Invalid secure session');
    try {
      await this.storage.write(JSON.stringify({ version: 1, session: parsed.data }));
    } catch {
      await this.clear();
      throw new SecureStorageFailure('write');
    }
  }
  async clear() {
    try {
      await this.storage.remove();
    } catch {
      throw new SecureStorageFailure('remove');
    }
  }
}

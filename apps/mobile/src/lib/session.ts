import { z } from 'zod';
import { ApiFailure, ClientFailure, readApi, type ApiClient } from '@hsm/api-client';
import { selfProfileSchema, type SelfProfile } from '@hsm/contracts';
import { mobileSessionSchema, type CredentialVault, type MobileSession } from './vault';
export const mobileLoginSchema = mobileSessionSchema.extend(selfProfileSchema.shape).strict();
const terminal = new Set([
  'UNAUTHENTICATED',
  'TOKEN_EXPIRED',
  'SESSION_REVOKED',
  'FORBIDDEN',
  'ACCOUNT_SUSPENDED',
]);
export class MobileSessionManager {
  private pending: Promise<unknown> = Promise.resolve();
  private restoration: Promise<SelfProfile | undefined> | undefined;
  constructor(
    private readonly client: ApiClient,
    private readonly vault: CredentialVault,
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.pending.then(work);
    this.pending = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
  restore(): Promise<SelfProfile | undefined> {
    if (this.restoration) return this.restoration;
    const work = this.serial(() => this.restoreStored());
    this.restoration = work;
    void work
      .finally(() => {
        if (this.restoration === work) this.restoration = undefined;
      })
      .catch(() => undefined);
    return work;
  }
  private async restoreStored() {
    const saved = await this.vault.read();
    if (!saved) return undefined;
    try {
      return await readApi(this.client.GET('/v1/me'), selfProfileSchema);
    } catch (error) {
      if (!(error instanceof ApiFailure)) throw error;
      if (!['UNAUTHENTICATED', 'TOKEN_EXPIRED'].includes(error.code)) {
        if (terminal.has(error.code)) await this.vault.clear();
        throw error;
      }
    }
    try {
      const next = await readApi(
        this.client.POST('/v1/auth/refresh', {
          body: { refreshToken: saved.refreshToken },
        }),
        mobileSessionSchema,
      );
      await this.vault.save(next);
      return await readApi(this.client.GET('/v1/me'), selfProfileSchema);
    } catch (error) {
      if (
        (error instanceof ApiFailure && terminal.has(error.code)) ||
        (error instanceof ClientFailure && error.code === 'INVALID_RESPONSE')
      )
        await this.vault.clear();
      throw error;
    }
  }
  establish(work: () => Promise<MobileSession>) {
    return this.serial(async () => {
      const session = await work();
      await this.vault.save(session);
      try {
        return await readApi(this.client.GET('/v1/me'), selfProfileSchema);
      } catch (error) {
        if (
          (error instanceof ApiFailure && terminal.has(error.code)) ||
          (error instanceof ClientFailure && error.code === 'INVALID_RESPONSE')
        )
          await this.vault.clear();
        throw error;
      }
    });
  }
  logout(allDevices = false) {
    return this.serial(async () => {
      try {
        if (await this.restoreStored())
          await readApi(
            this.client.POST(allDevices ? '/v1/auth/logout-all' : '/v1/auth/logout'),
            z.object({ revoked: z.literal(true) }).strict(),
          );
      } finally {
        await this.vault.clear();
      }
    });
  }
}

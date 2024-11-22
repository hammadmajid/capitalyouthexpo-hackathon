import { expect, it, vi } from 'vitest';
import { createApplication } from '../../src/app.js';
import { parseEnvironment } from '../../src/config.js';
import { AuthCrypto } from '../../src/auth/crypto.js';
import { AuthTransport } from '../../src/auth/transport.js';
import type { SessionService } from '../../src/auth/session.service.js';
import type { ManagerService } from '../../src/auth/manager.service.js';
import { testKeys } from '../keys.js';
vi.setConfig({ testTimeout: 30000 });
it('AUTH-M-004: activation validates shared inputs and supports secure web transport', async () => {
  const keys = testKeys();
  const activate = vi.fn().mockResolvedValue({
    accessToken: 'access',
    refreshToken: 'refresh',
    expiresIn: 600,
    sessionId: 'session',
    client: 'web',
  });
  const application = await createApplication(
    parseEnvironment({
      ...keys,
      APP_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: 'postgres://localhost/test',
      REDIS_URL: 'redis://localhost',
      CORS_ORIGINS: 'http://localhost:3000',
    }),
    {
      postgres: async () => undefined,
      redis: async () => undefined,
      increment: async () => 1,
      close: async () => undefined,
    },
    [],
    {
      sessions: {} as SessionService,
      transport: new AuthTransport(new AuthCrypto(keys), false),
      managers: { activate } as unknown as ManagerService,
    },
  );
  try {
    const payload = {
      phone: '+923001234567',
      tempPassword: 'Temporary password phrase',
      newPassword: 'Permanent password phrase',
      client: 'web',
    };
    const response = await application.inject({
      method: 'POST',
      url: '/v1/auth/manager/activate',
      payload,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).not.toHaveProperty('accessToken');
    expect(response.headers['set-cookie']).toHaveLength(3);
    expect(activate).toHaveBeenCalledWith(payload);
    for (const invalid of [
      { ...payload, branchId: 'foreign' },
      { ...payload, phone: 'bad' },
    ]) {
      expect(
        (
          await application.inject({
            method: 'POST',
            url: '/v1/auth/manager/activate',
            payload: invalid,
          })
        ).statusCode,
      ).toBe(400);
    }
  } finally {
    await application.close();
  }
});

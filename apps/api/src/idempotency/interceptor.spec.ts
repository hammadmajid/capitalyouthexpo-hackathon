import { randomUUID } from 'node:crypto';
import { Controller, Post, Get, type ExecutionContext, type CallHandler } from '@nestjs/common';
import { expect, it, vi } from 'vitest';
import { of, lastValueFrom } from 'rxjs';
import { z } from 'zod';
import { Self, Public } from '../access.js';
import { AuthGuard } from '../authorization/guards.js';
import type { AuthTransport } from '../auth/transport.js';
import type { SessionService } from '../auth/session.service.js';
import type { IdempotencyService } from './service.js';
import type { Transaction } from '../audit/writer.js';
import { Idempotent, IdempotencyInterceptor } from './interceptor.js';
import { fingerprint } from './policy.js';
const schema = z.object({ status: z.literal('suspended') }).strict();
@Controller('action')
class Probe {
  @Self() @Idempotent(schema) @Post() action() {
    return { status: 'suspended' };
  }
  @Self() @Idempotent(schema) @Get('invalid') invalid() {
    return {};
  }
  @Public() @Idempotent(schema) @Post('public') public() {
    return {};
  }
  @Idempotent(schema) @Post('undeclared') undeclared() {
    return {};
  }
  @Self() @Post('ordinary') ordinary() {
    return {};
  }
}
function fixture(method: keyof Probe = 'action') {
  const actor = { userId: randomUUID(), sessionId: randomUUID() };
  const request = {
    headers: { 'idempotency-key': String(randomUUID()) },
    params: {},
    method: method === 'invalid' ? 'GET' : 'POST',
    routeOptions: { url: '/action' },
    body: undefined,
    query: Object.create(Object.create(null)) as Record<string, unknown>,
  };
  const reply = { code: vi.fn(), header: vi.fn() };
  reply.code.mockReturnValue(reply);
  reply.header.mockReturnValue(reply);
  const http = { getRequest: () => request, getResponse: () => reply };
  const context = {
    getHandler: () => Probe.prototype[method],
    getClass: () => Probe,
    switchToHttp: () => http,
  } as unknown as ExecutionContext;
  const next: CallHandler = { handle: () => of({ status: 'suspended' }) };
  const guard = new AuthGuard({
    sessions: { authenticate: async () => actor } as unknown as SessionService,
    transport: { token: () => 'valid' } as unknown as AuthTransport,
  });
  return { actor, request, reply, context, next, guard };
}
it('PAY-008: opt-in HTTP execution revalidates scope and restores the stored status/body', async () => {
  const value = fixture();
  await value.guard.canActivate(value.context);
  const execute = vi.fn<IdempotencyService['execute']>(
    async (input, _scope, _body, _schema, authorize, work) => {
      expect(input.actor).toEqual(value.actor);
      expect(input.endpoint).toBe('POST /action');
      expect(() => fingerprint(input.endpoint, _scope, _body)).not.toThrow();
      await authorize({} as Transaction);
      return { status: 201, body: _schema.parse(await work()), replayed: true };
    },
  );
  const interceptor = new IdempotencyInterceptor({ execute } as unknown as IdempotencyService);
  expect(await lastValueFrom(interceptor.intercept(value.context, value.next))).toEqual({
    status: 'suspended',
  });
  expect(value.reply.code).toHaveBeenCalledWith(201);
  expect(value.reply.header).toHaveBeenCalledWith('Idempotency-Replayed', 'true');
});
it('SEC: ordinary endpoints pass through and unsafe idempotent declarations fail closed', async () => {
  const ordinary = fixture('ordinary');
  expect(
    await lastValueFrom(new IdempotencyInterceptor().intercept(ordinary.context, ordinary.next)),
  ).toEqual({ status: 'suspended' });
  const action = fixture();
  expect(() => new IdempotencyInterceptor().intercept(action.context, action.next)).toThrow(
    'Idempotency unavailable',
  );
  const service = {} as IdempotencyService;
  for (const method of ['invalid', 'public', 'undeclared'] as const) {
    const value = fixture(method);
    expect(() => new IdempotencyInterceptor(service).intercept(value.context, value.next)).toThrow(
      'scope unavailable',
    );
  }
  action.request.headers['idempotency-key'] = 'invalid';
  expect(() =>
    new IdempotencyInterceptor(service).intercept(action.context, action.next),
  ).toThrow();
});

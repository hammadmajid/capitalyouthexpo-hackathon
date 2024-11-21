import {
  SetMetadata,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, lastValueFrom } from 'rxjs';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '@hsm/contracts';
import { AuthorizationGuard, actorOf } from '../authorization/guards.js';
import { ScopeRepository } from '../authorization/repository.js';
import { declaration } from '../authorization/scope.js';
import type { IdempotencyService } from './service.js';
const IDEMPOTENCY = 'hsm:idempotency';
type Metadata = { schema: z.ZodType<unknown>; status: 200 | 201 | 202 };
export function Idempotent(schema: z.ZodType<unknown>, status: 200 | 201 | 202 = 200) {
  return SetMetadata(IDEMPOTENCY, { schema, status } satisfies Metadata);
}
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly service?: IdempotencyService) {}
  intercept(context: ExecutionContext, next: CallHandler) {
    const reflector = new Reflector();
    const metadata = reflector.get<Metadata | undefined>(IDEMPOTENCY, context.getHandler());
    if (!metadata) return next.handle();
    if (!this.service) throw new DomainError('INTERNAL', 503, 'Idempotency unavailable');
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const scope = declaration(reflector, context.getHandler(), context.getClass());
    if (
      !scope.success ||
      scope.data.kind === 'public' ||
      !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)
    )
      throw new DomainError('FORBIDDEN', 403, 'Idempotent scope unavailable');
    const key = z.string().uuid().parse(request.headers['idempotency-key']);
    const parameters = z.record(z.string().max(100)).parse(request.params);
    return from(
      this.service
        .execute(
          {
            actor: actorOf(request),
            key,
            endpoint: request.method + ' ' + request.routeOptions.url,
            status: metadata.status,
          },
          { declaration: scope.data, parameters },
          {
            body: request.body ?? null,
            query: z.record(z.unknown()).parse(request.query ?? {}),
          },
          metadata.schema,
          async (transaction) =>
            new AuthorizationGuard(new ScopeRepository(transaction)).canActivate(context),
          async () => lastValueFrom(next.handle()),
        )
        .then((result) => {
          reply.code(result.status).header('Idempotency-Replayed', String(result.replayed));
          return result.body;
        }),
    );
  }
}

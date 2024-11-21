import { Controller, Get, Inject, Param, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Self, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, identifier, nullable } from '../inventory/documentation.js';
import { InboxService } from './service.js';
export const INBOX_SERVICE = Symbol('InboxService');
const timestamp = { type: 'string' as const, format: 'date-time' };
@Self()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Own notification inbox')
@Controller('me/notifications')
export class InboxController {
  constructor(@Inject(INBOX_SERVICE) private readonly service: InboxService) {}
  @Get()
  @ApiOperation({
    summary: 'NTF-002 SEC-003: read own persisted notices and real unread count only',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiResponse({
    status: 200,
    schema: object({
      data: {
        type: 'array',
        items: object({
          id: identifier,
          type: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          readAt: nullable(timestamp),
          createdAt: timestamp,
        }),
      },
      nextCursor: nullable(identifier),
      unreadCount: { type: 'integer', minimum: 0 },
    }),
  })
  read(
    @Req() request: FastifyRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), query);
  }
  @Put(':id/read')
  @CookieCsrf()
  @ApiOperation({ summary: 'NTF-002 SEC-003: mark only own notice read with server time' })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiResponse({ status: 200, schema: object({ id: identifier, readAt: timestamp }) })
  async markRead(
    @Req() request: FastifyRequest,
    @Param('id', zodPipe(z.string().uuid())) id: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.markRead(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      id,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

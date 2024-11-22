import { Body, Controller, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { stayIdentifierSchema, stayNoticeInputSchema } from '@hsm/contracts';
import { Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { OwnStayNoticeService } from './own-notice.service.js';
import { OwnNoticeCommand } from './own-notice.documentation.js';
export const OWN_STAY_NOTICE_SERVICE = Symbol('own Stay notice');
const id = zodPipe(stayIdentifierSchema),
  emptySchema = z.object({}).strict(),
  empty = zodPipe(emptySchema);
@ApiTags('Phase 3 private Stay operations')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Self()
@Controller('me/stays/:stayId/checkout-request')
export class OwnStayNoticeController {
  constructor(@Inject(OWN_STAY_NOTICE_SERVICE) private readonly service: OwnStayNoticeService) {}
  @Post()
  @OwnNoticeCommand()
  @ApiOperation({
    operationId: 'submitOwnStayNotice',
    summary:
      'OUT-001/002/006 / SEC-003: record an own linked Stay departure notice; retain actual occupancy and disclose original agreed notice timing',
  })
  async submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', id) stayId: string,
    @Body(zodPipe(stayNoticeInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    emptySchema.parse(query);
    const result = await this.service.submit(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      stayId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

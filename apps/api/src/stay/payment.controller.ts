import { Body, Controller, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  paymentReversalInputSchema,
  recordExternalPaymentInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { identifier, object } from '../inventory/documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { StayPaymentService } from './payment.service.js';
import { RecordedPaymentCommand } from './payment.documentation.js';
export const STAY_PAYMENT_SERVICE = Symbol('StayPaymentService');
const id = zodPipe(stayIdentifierSchema),
  emptySchema = z.object({}).strict(),
  empty = zodPipe(emptySchema);
@ApiTags('Phase 3 private finance')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@BranchScope('branchId')
@AuthProblems()
@Controller('branches/:branchId/stays/:stayId/payments')
export class StayPaymentController {
  constructor(@Inject(STAY_PAYMENT_SERVICE) private readonly service: StayPaymentService) {}
  @Post()
  @RecordedPaymentCommand()
  @ApiOperation({
    operationId: 'recordStayExternalPayment',
    summary:
      'PAY-008 / NTF-002: authorized human external hostel payment, atomic immutable receipt and explicit allocation',
  })
  async record(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Body(zodPipe(recordExternalPaymentInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    emptySchema.parse(query);
    const result = await this.service.record(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      branchId,
      stayId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
  @Post(':paymentId/reverse')
  @CookieCsrf()
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier })
  @ApiOperation({
    operationId: 'reverseStayPayment',
    summary: 'Q14 / PAY-008: Owner-only reversal with reason; original receipt is retained',
  })
  @ApiBody({ schema: object({ reason: { type: 'string', minLength: 1, maxLength: 500 } }) })
  @ApiResponse({
    status: 201,
    schema: object({ reversalId: identifier, paymentId: identifier, receiptId: identifier }),
  })
  async reverse(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('paymentId', id) paymentId: string,
    @Body(zodPipe(paymentReversalInputSchema)) body: unknown,
  ) {
    const result = await this.service.reverse(
      actorOf(request),
      request.headers['idempotency-key'],
      branchId,
      stayId,
      paymentId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

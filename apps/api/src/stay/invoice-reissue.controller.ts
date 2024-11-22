import { Body, Controller, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { invoiceReissueInputSchema, stayIdentifierSchema } from '@hsm/contracts';
import { identifier, object } from '../inventory/documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { StayPaymentService } from './payment.service.js';
import { STAY_PAYMENT_SERVICE } from './payment.controller.js';
const id = zodPipe(stayIdentifierSchema);
@ApiTags('Phase 3 private finance')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@BranchScope('branchId')
@AuthProblems()
@Controller('branches/:branchId/stays/:stayId/invoices')
export class StayInvoiceReissueController {
  constructor(@Inject(STAY_PAYMENT_SERVICE) private readonly service: StayPaymentService) {}
  @Post(':invoiceId/reissue')
  @CookieCsrf()
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier })
  @ApiOperation({
    operationId: 'reissueStayInvoice',
    summary: 'CHG-053: Owner-only cancel of a wholly unpaid bill, reissued with a new due date',
  })
  @ApiBody({
    schema: object({
      dueDate: { type: 'string', format: 'date' },
      reason: { type: 'string', minLength: 1, maxLength: 500 },
    }),
  })
  @ApiResponse({
    status: 201,
    schema: object({ voidedInvoiceId: identifier, invoiceId: identifier }),
  })
  async reissue(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('invoiceId', id) invoiceId: string,
    @Body(zodPipe(invoiceReissueInputSchema)) body: unknown,
  ) {
    const result = await this.service.reissue(
      actorOf(request),
      request.headers['idempotency-key'],
      branchId,
      stayId,
      invoiceId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

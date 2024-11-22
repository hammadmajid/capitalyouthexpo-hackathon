import { Body, Controller, Get, Header, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { stayIdentifierSchema, stayStateSchema } from '@hsm/contracts';
import { BranchScope, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
import type { StayLifecycleService } from './lifecycle.service.js';
export const STAY_LIFECYCLE_SERVICE = Symbol('StayLifecycleService');
const id = zodPipe(stayIdentifierSchema);
const money: SchemaObject = { type: 'integer', minimum: 0 },
  date: SchemaObject = { type: 'string', format: 'date' },
  instant: SchemaObject = { type: 'string', format: 'date-time' },
  version: SchemaObject = { type: 'integer', minimum: 1 };
const balance = object({
  receivedPaisa: money,
  appliedToRentPaisa: money,
  deductedPaisa: money,
  refundedPaisa: money,
  heldPaisa: money,
});
const settlement = object(
  {
    stayId: identifier,
    branchId: identifier,
    stayState: { type: 'string', enum: stayStateSchema.options },
    invoices: { type: 'array', maxItems: 200, items: { type: 'object' } },
    invoicesTruncated: { type: 'boolean' },
    outstandingPaisa: money,
    nextInvoiceDueDate: nullable(date),
    lastApprovedPayment: nullable(
      object({
        paymentId: identifier,
        receiptId: identifier,
        receiptNumber: { type: 'string' },
        amountPaisa: money,
        receivedOn: date,
      }),
    ),
    deposit: balance,
    advance: balance,
    netPayablePaisa: money,
    netRefundablePaisa: money,
    fundSources: {
      type: 'array',
      maxItems: 100,
      items: object({
        paymentId: identifier,
        receiptNumber: { type: 'string' },
        depositPaisa: money,
        advanceCreditPaisa: money,
      }),
    },
    asOf: date,
  },
  ['nextInvoiceDueDate', 'lastApprovedPayment'],
);
const finalStatement = object({
  statementId: identifier,
  createdAt: instant,
  statement: settlement,
  afterCheckout: object({
    movements: {
      type: 'array',
      maxItems: 100,
      items: object({
        kind: {
          type: 'string',
          enum: [
            'deposit_apply',
            'advance_apply',
            'deposit_deduct',
            'deposit_refund',
            'advance_refund',
            'payment',
          ],
        },
        amountPaisa: money,
        recordedAt: instant,
        externalReference: nullable({ type: 'string', maxLength: 160 }),
      }),
    },
    current: settlement,
  }),
});
const key = { name: 'Idempotency-Key', required: true, schema: identifier };
function replay<T>(reply: FastifyReply, result: { status: number; replayed: boolean; body: T }) {
  reply
    .code(result.status)
    .header('Idempotency-Replayed', String(result.replayed))
    .header('Cache-Control', 'no-store');
  return result.body;
}
const target: SchemaObject = {
  oneOf: [
    object({ kind: { type: 'string', enum: ['bed'] }, roomId: identifier, bedId: identifier }),
    object({ kind: { type: 'string', enum: ['room'] }, roomId: identifier }),
  ],
};
@ApiTags('Phase 8 Stay lifecycle')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class StayLifecycleController {
  constructor(@Inject(STAY_LIFECYCLE_SERVICE) private readonly service: StayLifecycleService) {}
  @Post('branches/:branchId/stays/:stayId/transfer')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(key)
  @ApiOperation({
    operationId: 'transferStay',
    summary:
      'RES-005 / P9-FIX-01: atomic same-branch transfer; stay_manage (+ rent_manage, finance_view to reprice)',
  })
  @ApiBody({
    schema: object(
      {
        expectedVersion: version,
        target,
        effectiveAt: instant,
        reason: { type: 'string', maxLength: 500 },
        repricing: object({
          rentAmountPaisa: money,
          residentAgreed: { type: 'boolean', enum: [true] },
        }),
      },
      ['effectiveAt', 'repricing'],
    ),
  })
  @ApiResponse({
    status: 200,
    schema: object({
      stayId: identifier,
      fromAssignmentId: identifier,
      toAssignmentId: identifier,
      roomId: identifier,
      bedId: nullable(identifier),
      transferredAt: instant,
      agreement: nullable(
        object({
          agreementId: identifier,
          previousAgreementId: identifier,
          previousRentPaisa: money,
          rentAmountPaisa: money,
          effectiveFrom: date,
        }),
      ),
    }),
  })
  async transfer(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.transfer(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        stayId,
        body,
      ),
    );
  }
  @Post('branches/:branchId/stays/:stayId/extension')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(key)
  @ApiOperation({
    operationId: 'extendStay',
    summary:
      'STAY / P9-FIX-02: change the departure and continue billing; stay_manage + rent_manage',
  })
  @ApiBody({
    schema: object({
      expectedVersion: version,
      expectedLeaveDate: date,
      reason: { type: 'string', maxLength: 500 },
    }),
  })
  @ApiResponse({
    status: 200,
    schema: object({
      stayId: identifier,
      version,
      expectedLeaveDate: date,
      billing: {
        type: 'array',
        maxItems: 16,
        items: object({
          scheduleId: identifier,
          item: { type: 'string', enum: ['rent', 'mess', 'utilities', 'admission'] },
          result: {
            type: 'string',
            enum: ['topped_up', 'manual_top_up_required', 'resumed', 'manual_required'],
          },
        }),
      },
    }),
  })
  async extend(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.extend(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        stayId,
        body,
      ),
    );
  }
  @Post('branches/:branchId/stays/:stayId/checkout')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(key)
  @ApiOperation({
    operationId: 'checkoutStay',
    summary:
      'OUT-003..006 / P9-FIX-03: atomic checkout; finance_view + checkout_manage (+ payment_record to apply deposit)',
  })
  @ApiBody({
    schema: object({
      expectedVersion: version,
      reason: { type: 'string', maxLength: 500 },
      applyAvailableDeposit: { type: 'boolean' },
    }),
  })
  @ApiResponse({
    status: 200,
    schema: object({
      stayId: identifier,
      state: { type: 'string', enum: ['completed'] },
      closedAt: instant,
      statementId: identifier,
      statement: settlement,
      depositApplied: {
        type: 'array',
        maxItems: 400,
        items: object({ paymentId: identifier, invoiceId: identifier, amountPaisa: money }),
      },
    }),
  })
  async checkout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.checkout(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        stayId,
        body,
      ),
    );
  }
  @Post('branches/:branchId/stays/:stayId/fund-movements')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(key)
  @ApiOperation({
    operationId: 'recordStayFundMovement',
    summary: 'OUT-003/004: deposit/advance apply, deduction or recorded refund against a payment',
  })
  @ApiBody({
    schema: object({
      paymentId: identifier,
      movement: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: [
              'deposit_apply',
              'advance_apply',
              'deposit_deduct',
              'deposit_refund',
              'advance_refund',
            ],
          },
          amountPaisa: { type: 'integer', minimum: 1 },
          reason: { type: 'string', maxLength: 500 },
          invoiceId: identifier,
          externalReference: { type: 'string', maxLength: 160 },
        },
        required: ['kind', 'amountPaisa', 'reason'],
      },
    }),
  })
  @ApiResponse({
    status: 200,
    schema: object({
      movementId: identifier,
      paymentId: identifier,
      kind: { type: 'string' },
      amountPaisa: { type: 'integer', minimum: 1 },
    }),
  })
  async fundMovement(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.fundMovement(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        stayId,
        body,
      ),
    );
  }
  @Get('branches/:branchId/stays/:stayId/settlement')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStaySettlement',
    summary: 'OUT-005: live settlement; finance_view',
  })
  @ApiResponse({ status: 200, schema: settlement })
  staffSettlement(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
  ) {
    return this.service.settlement(actorOf(request), stayId, branchId);
  }
  @Get('me/stays/:stayId/settlement')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownStaySettlement',
    summary: 'OUT-005 / CHG-012: own live settlement',
  })
  @ApiResponse({ status: 200, schema: settlement })
  ownSettlement(@Req() request: FastifyRequest, @Param('stayId', id) stayId: string) {
    return this.service.settlement(actorOf(request), stayId);
  }
  @Get('branches/:branchId/stays/:stayId/final-statement')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffFinalStatement',
    summary: 'OUT-005: frozen checkout statement',
  })
  @ApiResponse({ status: 200, schema: finalStatement })
  staffStatement(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
  ) {
    return this.service.finalStatement(actorOf(request), stayId, branchId);
  }
  @Get('me/stays/:stayId/final-statement')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownFinalStatement',
    summary: 'OUT-005 / STAY-004: own Past Stay statement',
  })
  @ApiResponse({ status: 200, schema: finalStatement })
  ownStatement(@Req() request: FastifyRequest, @Param('stayId', id) stayId: string) {
    return this.service.finalStatement(actorOf(request), stayId);
  }
}

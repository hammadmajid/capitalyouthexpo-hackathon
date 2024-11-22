import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiQuery,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  externalPaymentMethodSchema,
  residentProofPageQuerySchema,
  residentProofStateSchema,
  staffProofPageQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { BranchScope, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
import type { ResidentProofService } from './proofs.service.js';
export const RESIDENT_PROOF_SERVICE = Symbol('ResidentProofService');
const id = zodPipe(stayIdentifierSchema);
const date: SchemaObject = { type: 'string', format: 'date' },
  instant: SchemaObject = { type: 'string', format: 'date-time' },
  money: SchemaObject = { type: 'integer', minimum: 0 },
  method: SchemaObject = { type: 'string', enum: externalPaymentMethodSchema.options };
const proof = object({
  id: identifier,
  branchId: identifier,
  stayId: identifier,
  invoiceId: nullable(identifier),
  invoiceNumber: nullable({ type: 'string' }),
  invoices: {
    type: 'array',
    minItems: 0,
    maxItems: 12,
    items: object({ invoiceId: identifier, invoiceNumber: { type: 'string' } }),
  },
  amountPaisa: money,
  depositPaisa: money,
  method,
  paidOn: date,
  reference: nullable({ type: 'string' }),
  state: { type: 'string', enum: residentProofStateSchema.options },
  reviewReason: nullable({ type: 'string' }),
  paymentId: nullable(identifier),
  receiptId: nullable(identifier),
  submittedAt: instant,
  reviewedAt: nullable(instant),
});
const page = (items: SchemaObject) =>
  object({ data: { type: 'array', maxItems: 50, items }, nextCursor: nullable(identifier) });
const staffRow = object({
  proof,
  residentName: { type: 'string' },
  roomLabel: nullable({ type: 'string' }),
  bedLabel: nullable({ type: 'string' }),
  invoiceOutstandingPaisa: money,
  depositOutstandingPaisa: money,
  amountMismatch: { type: 'boolean' },
});
const instruction = object({
  id: identifier,
  branchId: identifier,
  method,
  accountTitle: { type: 'string' },
  accountIdentifier: { type: 'string' },
  instructions: nullable({ type: 'string' }),
  createdAt: instant,
});
function replay<T>(reply: FastifyReply, result: { status: number; replayed: boolean; body: T }) {
  reply
    .code(result.status)
    .header('Idempotency-Replayed', String(result.replayed))
    .header('Cache-Control', 'no-store');
  return result.body;
}
const key = { name: 'Idempotency-Key', required: true, schema: identifier };
@ApiTags('Phase 7 payment proofs')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class ResidentProofController {
  constructor(@Inject(RESIDENT_PROOF_SERVICE) private readonly service: ResidentProofService) {}
  @Get('me/stays/:stayId/payment-instructions')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'stayPaymentInstructions',
    summary: 'PAY-001 / BR-01: where to pay this Stay’s hostel directly (own Stay only)',
  })
  @ApiResponse({
    status: 200,
    schema: object({
      branchId: identifier,
      data: { type: 'array', maxItems: 10, items: instruction },
    }),
  })
  instructions(@Req() request: FastifyRequest, @Param('stayId', id) stayId: string) {
    return this.service.instructions(actorOf(request), stayId);
  }
  @Get('me/stays/:stayId/payment-summary')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownStayPaymentSummary',
    summary: 'PAY-008: own agreed security, received security and pending deposit proof',
  })
  @ApiResponse({
    status: 200,
    schema: object({
      stayId: identifier,
      branchId: identifier,
      requiredDepositPaisa: money,
      receivedDepositPaisa: money,
      outstandingDepositPaisa: money,
      pendingDepositPaisa: money,
    }),
  })
  paymentSummary(@Req() request: FastifyRequest, @Param('stayId', id) stayId: string) {
    return this.service.paymentSummary(actorOf(request), stayId);
  }
  @Post('me/stays/:stayId/payment-proofs')
  @CookieCsrf()
  @ApiHeader(key)
  @Self()
  @ApiOperation({
    operationId: 'submitStayPaymentProof',
    summary: 'PAY-002/003: own invoice proof; pending verification, never marks paid',
  })
  @ApiBody({
    schema: object(
      {
        invoiceId: identifier,
        fileId: identifier,
        amountPaisa: { type: 'integer', minimum: 1 },
        depositPaisa: money,
        method: {
          type: 'string',
          enum: externalPaymentMethodSchema.options.filter((value) => value !== 'cash'),
        },
        paidOn: date,
        reference: { type: 'string', maxLength: 120 },
        alsoInvoiceIds: { type: 'array', maxItems: 11, items: identifier },
      },
      ['reference', 'alsoInvoiceIds', 'invoiceId', 'depositPaisa'],
    ),
  })
  @ApiResponse({ status: 201, schema: proof })
  async submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', id) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.submit(actorOf(request), request.headers['idempotency-key'], stayId, body),
    );
  }
  @Get('me/stays/:stayId/payment-proofs')
  @ApiQuery({
    name: 'state',
    required: false,
    schema: { type: 'string', enum: residentProofStateSchema.options },
  })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownStayPaymentProofs',
    summary: 'PAY-006: own proofs and outcomes',
  })
  @ApiResponse({ status: 200, schema: page(proof) })
  own(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Query(zodPipe(residentProofPageQuerySchema)) query: unknown,
  ) {
    return this.service.ownPage(actorOf(request), stayId, query);
  }
  @Get('branches/:branchId/payment-proofs')
  @ApiQuery({
    name: 'state',
    required: false,
    schema: { type: 'string', enum: residentProofStateSchema.options },
  })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({ name: 'stayId', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchPaymentProofQueue',
    summary: 'PAY-004/005: verification queue with mismatch warnings; requires finance_view',
  })
  @ApiResponse({ status: 200, schema: page(staffRow) })
  queue(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Query(zodPipe(staffProofPageQuerySchema)) query: unknown,
  ) {
    return this.service.queue(actorOf(request), branchId, query);
  }
  @Post('branches/:branchId/payment-proofs/:proofId/review')
  @CookieCsrf()
  @ApiHeader(key)
  @BranchScope('branchId')
  @ApiOperation({
    operationId: 'reviewStayPaymentProof',
    summary: 'PAY-006..009: approve (post payment and receipt) or reject with reason',
  })
  @ApiBody({
    schema: object(
      {
        decision: { type: 'string', enum: ['approve', 'reject'] },
        reason: { type: 'string', minLength: 1, maxLength: 500 },
      },
      ['reason'],
    ),
  })
  @ApiResponse({ status: 200, schema: proof })
  async review(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('proofId', id) proofId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.review(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        proofId,
        body,
      ),
    );
  }
  @Get('branches/:branchId/payment-proofs/:proofId/download')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'downloadStayPaymentProof',
    summary: 'SEC-003: short-lived audited link to the private proof; requires finance_view',
  })
  @ApiResponse({ status: 200, schema: object({ url: { type: 'string' }, expiresAt: instant }) })
  download(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('proofId', id) proofId: string,
  ) {
    return this.service.download(actorOf(request), branchId, proofId);
  }
}

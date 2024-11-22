import { Controller, Get, Header, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { renderReceiptPdf } from './receipt-pdf.js';
import { stayIdentifierSchema } from '@hsm/contracts';
import { BranchScope, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { StayReceiptService } from './receipt.service.js';
import { receiptDetailDocumentation } from './receipt.documentation.js';
export const STAY_RECEIPT_SERVICE = Symbol('StayReceiptService');
const id = zodPipe(stayIdentifierSchema),
  empty = zodPipe(z.object({}).strict());
@ApiTags('Phase 3 private finance')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class StayReceiptController {
  constructor(@Inject(STAY_RECEIPT_SERVICE) private readonly service: StayReceiptService) {}
  @Get('branches/:branchId/stays/:stayId/receipts/:receiptId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStayReceiptDetail',
    summary: 'FIN-001 / PAY-008: exact private historical receipt; live finance_view required',
  })
  @ApiResponse({ status: 200, schema: receiptDetailDocumentation })
  staffDetail(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('receiptId', id) receiptId: string,
    @Query(empty) query: unknown,
  ) {
    return this.service.staffDetail(actorOf(request), branchId, stayId, receiptId, query);
  }
  @Get('me/stays/:stayId/receipts/:receiptId')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'customerStayReceiptDetail',
    summary: 'RES-001 / SEC-003: only an explicitly account-linked own Stay receipt',
  })
  @ApiResponse({ status: 200, schema: receiptDetailDocumentation })
  customerDetail(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Param('receiptId', id) receiptId: string,
    @Query(empty) query: unknown,
  ) {
    return this.service.customerDetail(actorOf(request), stayId, receiptId, query);
  }
  // PAY-009: the same authorized reads, rendered as a private, uncached PDF download.
  @Get('branches/:branchId/stays/:stayId/receipts/:receiptId/pdf')
  @BranchScope('branchId')
  @ApiOperation({
    operationId: 'staffStayReceiptPdf',
    summary: 'PAY-009: receipt PDF from its immutable snapshot; live finance_view required',
  })
  @ApiResponse({ status: 200, description: 'application/pdf' })
  async staffPdf(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('receiptId', id) receiptId: string,
    @Query(empty) query: unknown,
  ) {
    return pdf(
      reply,
      await this.service.staffDetail(actorOf(request), branchId, stayId, receiptId, query),
    );
  }
  @Get('me/stays/:stayId/receipts/:receiptId/pdf')
  @Self()
  @ApiOperation({
    operationId: 'customerStayReceiptPdf',
    summary: 'PAY-009 / SEC-003: own Stay receipt PDF; authenticated download only',
  })
  @ApiResponse({ status: 200, description: 'application/pdf' })
  async customerPdf(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', id) stayId: string,
    @Param('receiptId', id) receiptId: string,
    @Query(empty) query: unknown,
  ) {
    return pdf(
      reply,
      await this.service.customerDetail(actorOf(request), stayId, receiptId, query),
    );
  }
}
function pdf(reply: FastifyReply, detail: Parameters<typeof renderReceiptPdf>[0]) {
  reply
    .header('Content-Type', 'application/pdf')
    .header(
      'Content-Disposition',
      `attachment; filename="receipt-${detail.receiptNumber.replace(/[^A-Za-z0-9-]/g, '')}.pdf"`,
    )
    .header('Cache-Control', 'no-store');
  return renderReceiptPdf(detail);
}

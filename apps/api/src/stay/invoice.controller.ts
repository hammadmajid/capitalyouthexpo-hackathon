import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import {
  staffStayInvoiceReferenceQuerySchema,
  stayIdentifierSchema,
  stayInvoiceReferenceQuerySchema,
} from '@hsm/contracts';
import { BranchScope, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { StayInvoiceService } from './invoice.service.js';
import {
  invoiceBalanceDocumentation,
  invoiceReferencePageDocumentation,
} from './invoice.documentation.js';
export const STAY_INVOICE_SERVICE = Symbol('StayInvoiceService');
const id = zodPipe(stayIdentifierSchema),
  empty = zodPipe(z.object({}).strict());
@ApiTags('Phase 3 private finance')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class StayInvoiceController {
  constructor(@Inject(STAY_INVOICE_SERVICE) private readonly service: StayInvoiceService) {}
  @Get('branches/:branchId/stays/:stayId/invoices')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStayInvoiceReferences',
    summary: 'FIN-001 / SEC-003: bounded private invoice selection, live finance_view required',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({ status: 200, schema: invoiceReferencePageDocumentation })
  @ApiQuery({ name: 'category', required: false, schema: { type: 'string', enum: ['transport'] } })
  staffList(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Query(zodPipe(staffStayInvoiceReferenceQuerySchema)) query: unknown,
  ) {
    return this.service.staffList(actorOf(request), branchId, stayId, query);
  }
  @Get('me/stays/:stayId/invoices')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'customerStayInvoiceReferences',
    summary: 'RES-001 / SEC-003: bounded invoice references from the explicitly linked own Stay',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({ status: 200, schema: invoiceReferencePageDocumentation })
  customerList(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Query(zodPipe(stayInvoiceReferenceQuerySchema)) query: unknown,
  ) {
    return this.service.customerList(actorOf(request), stayId, query);
  }
  @Get('branches/:branchId/stays/:stayId/invoices/:invoiceId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStayInvoiceBalance',
    summary: 'FIN-001 / PAY-008: exact private receipt-backed balance; live finance_view required',
  })
  @ApiResponse({ status: 200, schema: invoiceBalanceDocumentation })
  staffBalance(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('invoiceId', id) invoiceId: string,
    @Query(empty) query: unknown,
  ) {
    return this.service.staffBalance(actorOf(request), branchId, stayId, invoiceId, query);
  }
  @Get('me/stays/:stayId/invoices/:invoiceId')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'customerStayInvoiceBalance',
    summary: 'RES-001 / SEC-003: only an explicitly account-linked own Stay invoice',
  })
  @ApiResponse({ status: 200, schema: invoiceBalanceDocumentation })
  customerBalance(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Param('invoiceId', id) invoiceId: string,
    @Query(empty) query: unknown,
  ) {
    return this.service.customerBalance(actorOf(request), stayId, invoiceId, query);
  }
}

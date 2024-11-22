import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  invoiceFinancialStateSchema,
  rentBoardQuerySchema,
  rentBoardStateSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
import type { RentBoardService } from './rent-board.service.js';
export const RENT_BOARD_SERVICE = Symbol('RentBoardService');
const money: SchemaObject = { type: 'integer', minimum: 0 };
const invoice = object({
  invoiceId: identifier,
  invoiceNumber: { type: 'string' },
  currency: { type: 'string', enum: ['PKR'] },
  dueDate: { type: 'string', format: 'date' },
  graceDays: { type: 'integer', minimum: 0 },
  totalPaisa: money,
  debitAdjustmentsPaisa: money,
  creditAdjustmentsPaisa: money,
  allocatedPaisa: money,
  outstandingPaisa: money,
  state: { type: 'string', enum: invoiceFinancialStateSchema.options },
});
const rentBoardDocumentation = object({
  branchId: identifier,
  month: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
  data: {
    type: 'array',
    maxItems: 25,
    items: object({
      stayId: identifier,
      residentId: identifier,
      displayName: { type: 'string' },
      stayState: { type: 'string' },
      roomLabel: nullable({ type: 'string' }),
      bedLabel: nullable({ type: 'string' }),
      state: { type: 'string', enum: rentBoardStateSchema.options },
      pendingProofs: { type: 'integer', minimum: 0 },
      invoices: { type: 'array', maxItems: 31, items: invoice },
    }),
  },
  nextCursor: nullable(identifier),
});
@ApiTags('Phase 6 Rent Board')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('branches/:branchId/rent-board')
export class RentBoardController {
  constructor(@Inject(RENT_BOARD_SERVICE) private readonly service: RentBoardService) {}
  @Get()
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'month', required: false, schema: { type: 'string', example: '2026-10' } })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 25, default: 20 },
  })
  @ApiOperation({
    operationId: 'branchRentBoard',
    summary: 'RB-001..004 / RENT-004: billing-month invoices per Stay; requires finance_view',
  })
  @ApiResponse({ status: 200, schema: rentBoardDocumentation })
  page(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(stayIdentifierSchema)) branchId: string,
    @Query(zodPipe(rentBoardQuerySchema)) query: unknown,
  ) {
    return this.service.page(actorOf(request), branchId, query);
  }
}

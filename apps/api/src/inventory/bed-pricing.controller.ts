import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { bedRentInputSchema, bedRentQuerySchema, stayIdentifierSchema } from '@hsm/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import { INVENTORY_SERVICE } from './controller.js';
import { InventoryService } from './service.js';
import { object, identifier, money, nullable } from './documentation.js';
const inputDoc = object(
  {
    depositPaisa: money,
    effectiveFrom: { type: 'string', format: 'date' },
    monthlyRentPaisa: money,
  },
  ['depositPaisa'],
);
const versionDoc = object(
  {
    ...inputDoc.properties,
    depositPaisa: nullable(money),
    id: identifier,
    branchId: identifier,
    roomId: identifier,
    bedId: identifier,
    createdAt: { type: 'string', format: 'date-time' },
  },
  ['depositPaisa'],
);
const pageDoc = object({
  branchId: identifier,
  roomId: identifier,
  bedId: identifier,
  bedLabel: { type: 'string' },
  canEdit: { type: 'boolean' },
  current: nullable(
    object(
      {
        monthlyRentPaisa: money,
        depositPaisa: money,
        priceVersionId: nullable(identifier),
        effectiveFrom: nullable({ type: 'string', format: 'date' }),
      },
      ['depositPaisa'],
    ),
  ),
  data: { type: 'array', maxItems: 50, items: versionDoc },
  nextCursor: nullable(identifier),
});
const id = zodPipe(stayIdentifierSchema);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Individual bed pricing')
@Controller('branches/:branchId/inventory/beds/:bedId/prices')
export class BedPricingController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Get()
  @ApiOperation({
    operationId: 'bedRentHistory',
    summary: 'CHG-056 / BKG-004: scoped physical-bed current rent and retained versions',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @ApiResponse({ status: 200, schema: pageDoc })
  history(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branch: string,
    @Param('bedId', id) bed: string,
    @Query(zodPipe(bedRentQuerySchema)) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.bedPriceHistory(actorOf(request), branch, bed, query);
  }
  @Post()
  @CookieCsrf()
  @ApiOperation({
    operationId: 'scheduleBedRent',
    summary: 'CHG-056 / ACC-006: publish rent for this bed only; existing agreements unchanged',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: inputDoc })
  @ApiResponse({ status: 201, schema: versionDoc })
  async publish(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branch: string,
    @Param('bedId', id) bed: string,
    @Body(zodPipe(bedRentInputSchema)) input: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.scheduleBedPrice(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      branch,
      bed,
      input,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

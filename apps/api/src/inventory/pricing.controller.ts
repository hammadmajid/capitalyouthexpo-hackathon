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
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { roomPriceInputSchema, roomPriceQuerySchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { INVENTORY_SERVICE } from './controller.js';
import { InventoryService } from './service.js';
import {
  priceHistoryDocumentation,
  priceInputDocumentation,
  priceVersionDocumentation,
} from './pricing.documentation.js';
const id = z.string().uuid(),
  pipe = zodPipe(id);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 3 effective pricing')
@Controller('branches/:branchId/inventory/room-types/:roomTypeId/prices')
export class InventoryPricingController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Get()
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'date' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiOperation({
    operationId: 'inventoryPriceHistory',
    summary: 'BKG-004 / ACC-004: scoped retained price history',
  })
  @ApiResponse({ status: 200, schema: priceHistoryDocumentation })
  history(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branch: string,
    @Param('roomTypeId', pipe) type: string,
    @Query(zodPipe(roomPriceQuerySchema)) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.priceHistory(actorOf(request), branch, type, query);
  }
  @Post()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: priceInputDocumentation })
  @ApiOperation({
    operationId: 'scheduleInventoryPrice',
    summary: 'BKG-004 / AUD-001: publish an immutable dated price',
  })
  @ApiResponse({ status: 201, schema: priceVersionDocumentation })
  async schedule(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branch: string,
    @Param('roomTypeId', pipe) type: string,
    @Body(zodPipe(roomPriceInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.schedulePrice(
      actorOf(request),
      id.parse(request.headers['idempotency-key']),
      branch,
      type,
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

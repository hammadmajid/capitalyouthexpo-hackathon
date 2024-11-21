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
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { inventoryBlockInputSchema, inventoryBlockReleaseSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, identifier, nullable } from './documentation.js';
import { ManagementList } from '../management/documentation.js';
import { InventoryBlockService } from './blocks.service.js';
export const INVENTORY_BLOCK_SERVICE = Symbol('InventoryBlockService');
const uuid = zodPipe(z.string().uuid());
const target = {
  oneOf: [
    object({ kind: { type: 'string' as const, enum: ['room'] }, roomId: identifier }),
    object({
      kind: { type: 'string' as const, enum: ['bed'] },
      roomId: identifier,
      bedId: identifier,
    }),
  ],
};
const range = object({
  moveInDate: { type: 'string', format: 'date' },
  moveOutDate: { type: 'string', format: 'date' },
});
const kind = { type: 'string' as const, enum: ['manual', 'maintenance'] };
const reason = { type: 'string' as const, minLength: 1, maxLength: 500 };
const stateFields = {
  id: identifier,
  branchId: identifier,
  target,
  range,
  kind,
  releasedAt: nullable({ type: 'string', format: 'date-time' }),
};
const state = object(stateFields);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Scoped inventory blocks')
@Controller('branches/:branchId/inventory/blocks')
export class InventoryBlockController {
  constructor(@Inject(INVENTORY_BLOCK_SERVICE) private readonly service: InventoryBlockService) {}
  @Get()
  @ManagementList(
    object({
      ...stateFields,
      roomLabel: { type: 'string' },
      bedLabel: nullable({ type: 'string' }),
      createdAt: { type: 'string', format: 'date-time' },
    }),
  )
  @ApiQuery({
    name: 'state',
    required: false,
    schema: { type: 'string', enum: ['unreleased', 'released', 'all'], default: 'unreleased' },
  })
  @ApiOperation({
    summary: 'ACC-004: read bounded exact-branch block history without private audit reasons',
  })
  list(
    @Req() request: FastifyRequest,
    @Param('branchId', uuid) branchId: string,
    @Query() page: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.list(actorOf(request), branchId, page);
  }
  @Post()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: object({ target, range, kind, reason }) })
  @ApiResponse({ status: 201, schema: state })
  @ApiOperation({
    summary: 'ACC-001/004: block exact physical inventory with real overlap constraints and audit',
  })
  async create(
    @Req() request: FastifyRequest,
    @Param('branchId', uuid) branchId: string,
    @Body(zodPipe(inventoryBlockInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.create(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
  @Post(':blockId/release')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: object({ reason }) })
  @ApiResponse({ status: 200, schema: state })
  @ApiOperation({
    summary: 'ACC-001/004: release a scoped block without deleting historical references',
  })
  async release(
    @Req() request: FastifyRequest,
    @Param('branchId', uuid) branchId: string,
    @Param('blockId', uuid) blockId: string,
    @Body(zodPipe(inventoryBlockReleaseSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.release(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      blockId,
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

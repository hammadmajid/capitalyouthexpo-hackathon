import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { inventoryPageQuerySchema, type InventoryPageQuery } from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { INVENTORY_SERVICE } from './controller.js';
import type { InventoryService } from './service.js';
import {
  inventoryAccessDocumentation,
  inventoryTypePageDocumentation,
  inventoryRoomPageDocumentation,
  inventorySeatPageDocumentation,
} from './pages.documentation.js';
const identifier = zodPipe(
  z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 2 inventory pages')
@Controller('branches/:branchId/inventory/pages')
export class InventoryPagesController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Get('access')
  @ApiOperation({
    summary: 'ACC-004 / PERF: current inventory permissions without physical inventory reads',
  })
  @ApiResponse({ status: 200, schema: inventoryAccessDocumentation })
  access(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Query(zodPipe(z.object({}).strict())) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.access(actorOf(request), branchId, query);
  }
  @Get('room-types')
  @ApiOperation({ summary: 'ROOM-002 / ACC-004: bounded room types with current branch authority' })
  @ApiQuery({ name: 'cursor', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, default: 20 })
  @ApiResponse({ status: 200, schema: inventoryTypePageDocumentation })
  types(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Query(zodPipe(inventoryPageQuerySchema)) query: InventoryPageQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.page(actorOf(request), branchId, 'room_types', query, undefined);
  }
  @Get('room-types/:roomTypeId/rooms')
  @ApiOperation({ summary: 'ROOM-002 / ACC-004: bounded rooms of an authorized active room type' })
  @ApiQuery({ name: 'cursor', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, default: 20 })
  @ApiResponse({ status: 200, schema: inventoryRoomPageDocumentation })
  rooms(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('roomTypeId', identifier) roomTypeId: string,
    @Query(zodPipe(inventoryPageQuerySchema)) query: InventoryPageQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.page(actorOf(request), branchId, 'rooms', query, roomTypeId);
  }
  @Get('rooms/:roomId/seats')
  @ApiOperation({
    summary: 'ROOM-002 / ACC-004: bounded beds of an authorized active room and room type',
  })
  @ApiQuery({ name: 'cursor', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number, minimum: 1, maximum: 100, default: 20 })
  @ApiResponse({ status: 200, schema: inventorySeatPageDocumentation })
  seats(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('roomId', identifier) roomId: string,
    @Query(zodPipe(inventoryPageQuerySchema)) query: InventoryPageQuery,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.page(actorOf(request), branchId, 'seats', query, roomId);
  }
}

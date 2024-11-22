import { Controller, Get, Inject, Param, Query, Res, applyDecorators } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { MARKETPLACE_SERVICE } from './controller.js';
import { MarketplaceService } from './service.js';
import {
  publicTypePageDocumentation,
  publicRoomPageDocumentation,
  publicBedPageDocumentation,
} from './public-pages.documentation.js';
const idPipe = zodPipe(
  z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
);
const PageQueries = () =>
  applyDecorators(
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } }),
    ApiQuery({ name: 'moveInDate', required: false, schema: { type: 'string', format: 'date' } }),
    ApiQuery({ name: 'moveOutDate', required: false, schema: { type: 'string', format: 'date' } }),
  );
@Public()
@ApiTags('Phase 2 public marketplace')
@Controller('marketplace/:branchId/inventory/pages')
export class MarketplaceInventoryPagesController {
  constructor(@Inject(MARKETPLACE_SERVICE) private readonly service: MarketplaceService) {}
  @Get('room-types')
  @ApiOperation({
    operationId: 'publicTypes',
    summary: 'ROOM-002 / ACC-002: public room-type metadata page without physical child arrays',
  })
  @PageQueries()
  @ApiResponse({ status: 200, schema: publicTypePageDocumentation })
  types(
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.inventoryPage(branchId, 'room_types', undefined, query);
  }
  @Get('room-types/:roomTypeId/rooms')
  @ApiOperation({
    operationId: 'publicRooms',
    summary:
      'ROOM-002 / ACC-002: selected public type room page with date-specific whole-room availability',
  })
  @PageQueries()
  @ApiResponse({ status: 200, schema: publicRoomPageDocumentation })
  rooms(
    @Param('branchId', idPipe) branchId: string,
    @Param('roomTypeId', idPipe) parent: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.inventoryPage(branchId, 'rooms', parent, query);
  }
  @Get('rooms/:roomId/beds')
  @ApiOperation({
    operationId: 'publicBeds',
    summary:
      'SEAT-001 / ACC-002: selected public room bed page with no occupant or unavailability-reason fields',
  })
  @PageQueries()
  @ApiResponse({ status: 200, schema: publicBedPageDocumentation })
  beds(
    @Param('branchId', idPipe) branchId: string,
    @Param('roomId', idPipe) parent: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.inventoryPage(branchId, 'seats', parent, query);
  }
}

import { Body, Controller, Get, Inject, Param, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { roomAmenitiesInputSchema } from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, identifier } from './documentation.js';
import { RoomAmenitiesService } from './room-amenities.service.js';
export const ROOM_AMENITIES_SERVICE = Symbol('RoomAmenitiesService');
const code = { type: 'string' as const, pattern: '^[a-z][a-z0-9_]{1,47}$' };
const inputDocumentation = object({
  amenityCodes: { type: 'array', maxItems: 100, uniqueItems: true, items: code },
});
const stateDocumentation = object({
  branchId: identifier,
  roomTypeId: identifier,
  canEdit: { type: 'boolean' },
  version: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  amenities: {
    type: 'array',
    maxItems: 100,
    items: object({
      code,
      name: { type: 'string', minLength: 1, maxLength: 80 },
      isActive: { type: 'boolean' },
    }),
  },
});
@BranchScope('branchId')
@AuthProblems()
@ApiTags('Phase 2 room amenities')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/room-types/:roomTypeId/amenities')
export class RoomAmenitiesController {
  constructor(@Inject(ROOM_AMENITIES_SERVICE) private readonly service: RoomAmenitiesService) {}
  @Get()
  @ApiOperation({
    summary: 'ROOM-002 / ACC-004: scoped current room-type amenities and listing-edit authority',
  })
  @ApiResponse({
    status: 200,
    schema: stateDocumentation,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  async read(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Param('roomTypeId', zodPipe(z.string().uuid())) roomTypeId: string,
    @Query(zodPipe(z.object({}).strict())) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.read(actorOf(request), branchId, roomTypeId, query);
    reply.header('Cache-Control', 'no-store').header('ETag', '"' + result.version + '"');
    return result;
  }
  @Put()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiHeader({
    name: 'If-Match',
    required: true,
    schema: { type: 'string', pattern: '^"[a-f0-9]{64}"$' },
  })
  @ApiBody({ schema: inputDocumentation })
  @ApiResponse({
    status: 200,
    schema: stateDocumentation,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  @ApiResponse({ status: 412, description: 'PRECONDITION_FAILED: refresh changed room amenities.' })
  @ApiOperation({
    summary:
      'ROOM-002 / ACC-004 / AUD-001: versioned audited catalog selection, independent of pricing',
  })
  async save(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Param('roomTypeId', zodPipe(z.string().uuid())) roomTypeId: string,
    @Body(zodPipe(roomAmenitiesInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.save(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      roomTypeId,
      request.headers['if-match'],
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed))
      .header('ETag', '"' + result.body.version + '"');
    return result.body;
  }
}

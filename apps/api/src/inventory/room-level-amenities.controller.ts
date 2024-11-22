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
import { roomLevelAmenitiesInputSchema } from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, identifier } from './documentation.js';
import { RoomLevelAmenitiesService } from './room-level-amenities.service.js';
export const ROOM_LEVEL_AMENITIES_SERVICE = Symbol('RoomLevelAmenitiesService');
const code = { type: 'string' as const, pattern: '^[a-z][a-z0-9_]{1,47}$' };
const inputDocumentation = {
  oneOf: [
    object({ mode: { type: 'string', enum: ['inherit'] } }),
    object({
      mode: { type: 'string', enum: ['custom'] },
      amenityCodes: { type: 'array', maxItems: 100, uniqueItems: true, items: code },
    }),
  ],
};
const list = {
  type: 'array' as const,
  maxItems: 100,
  items: object({
    code,
    name: { type: 'string', minLength: 1, maxLength: 80 },
    isActive: { type: 'boolean' },
  }),
};
const stateDocumentation = object({
  branchId: identifier,
  roomId: identifier,
  roomTypeId: identifier,
  customized: { type: 'boolean' },
  canEdit: { type: 'boolean' },
  version: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  amenities: list,
  typeAmenities: list,
});
@BranchScope('branchId')
@AuthProblems()
@ApiTags('Owner setup room amenities')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/rooms/:roomId/amenities')
export class RoomLevelAmenitiesController {
  constructor(
    @Inject(ROOM_LEVEL_AMENITIES_SERVICE) private readonly service: RoomLevelAmenitiesService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'ROOM-AMN (SRS v2.15): effective room amenities, room-type set and listing-edit authority',
  })
  @ApiResponse({
    status: 200,
    schema: stateDocumentation,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  async read(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Param('roomId', zodPipe(z.string().uuid())) roomId: string,
    @Query(zodPipe(z.object({}).strict())) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.read(actorOf(request), branchId, roomId, query);
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
    summary: 'ROOM-AMN / ACC-004 / AUD-001: versioned audited inherit-or-custom room amenities',
  })
  async save(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Param('roomId', zodPipe(z.string().uuid())) roomId: string,
    @Body(zodPipe(roomLevelAmenitiesInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.save(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      roomId,
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

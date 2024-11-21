import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  roomTypeInputSchema,
  roomInputSchema,
  seatInputSchema,
  roomDuplicationInputSchema,
  type RoomTypeInput,
  type RoomInput,
  type SeatInput,
} from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { InventoryService } from './service.js';
import {
  typeInputDocumentation,
  roomInputDocumentation,
  seatInputDocumentation,
  mutationDocumentation,
  branchInventoryDocumentation,
} from './documentation.js';
import {
  duplicationInputDocumentation,
  duplicationResultDocumentation,
} from './duplication.documentation.js';
export const INVENTORY_SERVICE = Symbol('InventoryService');
const id = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  pipe = zodPipe(id);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 2 inventory')
@Controller('branches/:branchId/inventory')
export class InventoryController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Post('rooms/:roomId/duplicate')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: duplicationInputDocumentation })
  @ApiResponse({ status: 201, schema: duplicationResultDocumentation })
  @ApiOperation({
    operationId: 'duplicateInventoryRoom',
    summary:
      'PROP-001 / ROOM-002: atomically duplicate room configuration with new physical identities',
  })
  async duplicate(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomId', pipe) roomId: string,
    @Body(zodPipe(roomDuplicationInputSchema)) body: unknown,
  ) {
    const result = await this.service.duplicate(
      actorOf(request),
      this.key(request),
      branchId,
      roomId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
  @Get()
  @ApiOperation({ summary: 'ACC-004: read inventory for an authorized branch' })
  @ApiResponse({ status: 200, schema: branchInventoryDocumentation })
  read(@Req() request: FastifyRequest, @Param('branchId', pipe) branchId: string) {
    return this.service.read(actorOf(request), branchId);
  }
  @Post('room-types')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: typeInputDocumentation })
  @ApiResponse({ status: 200, schema: mutationDocumentation })
  @ApiOperation({ summary: 'BKG-003: create a room type and disclosed prices atomically' })
  roomType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(roomTypeInputSchema)) body: RoomTypeInput,
  ) {
    return this.respond(
      reply,
      this.service.roomType(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Put('room-types/:roomTypeId')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: typeInputDocumentation })
  @ApiResponse({ status: 200, schema: mutationDocumentation })
  @ApiOperation({ summary: 'BKG-004: update current prices without rewriting booking snapshots' })
  updateType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
    @Body(zodPipe(roomTypeInputSchema)) body: RoomTypeInput,
  ) {
    return this.respond(
      reply,
      this.service.roomType(actorOf(request), this.key(request), branchId, body, roomTypeId),
    );
  }
  @Post('rooms')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: roomInputDocumentation })
  @ApiResponse({ status: 200, schema: mutationDocumentation })
  @ApiOperation({ summary: 'ACC-001/004: create a physical room within the branch' })
  room(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(roomInputSchema)) body: RoomInput,
  ) {
    return this.respond(
      reply,
      this.service.room(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Post('rooms/:roomId/seats')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: seatInputDocumentation })
  @ApiResponse({ status: 200, schema: mutationDocumentation })
  @ApiOperation({ summary: 'ACC-001: add a physical bed with a stable server-assigned ordinal' })
  seat(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomId', pipe) roomId: string,
    @Body(zodPipe(seatInputSchema)) body: SeatInput,
  ) {
    return this.respond(
      reply,
      this.service.seat(actorOf(request), this.key(request), branchId, roomId, body),
    );
  }
  private key(request: FastifyRequest) {
    return id.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<InventoryService['room']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

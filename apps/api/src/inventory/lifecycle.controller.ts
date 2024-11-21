import {
  applyDecorators,
  Body,
  Controller,
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
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { inventoryStateInputSchema, inventoryArchiveInputSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, status, mutationDocumentation } from './documentation.js';
import { INVENTORY_SERVICE } from './controller.js';
import { InventoryService } from './service.js';
const identifier = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  pipe = zodPipe(identifier);
const reason = { type: 'string' as const, minLength: 1, maxLength: 500 };
function command(schema: SchemaObject, summary: string, operationId: string) {
  return applyDecorators(
    CookieCsrf(),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      schema: { type: 'string', format: 'uuid' },
    }),
    ApiBody({ schema }),
    ApiResponse({ status: 200, schema: mutationDocumentation }),
    ApiOperation({ summary, operationId }),
  );
}
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 2 inventory lifecycle')
@Controller('branches/:branchId/inventory')
export class InventoryLifecycleController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Put('rooms/:roomId/status')
  @command(
    object({ status, reason }),
    'PROP-002 / ACC-001/004: change room availability without breaking live reservations',
    'changeRoomState',
  )
  roomState(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomId', pipe) roomId: string,
    @Body(zodPipe(inventoryStateInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.state(actorOf(request), this.key(request), branchId, 'room', roomId, body),
    );
  }
  @Put('seats/:seatId/status')
  @command(
    object({ status, reason }),
    'PROP-002 / ACC-001/004: change seat availability without breaking live reservations',
    'changeBedState',
  )
  seatState(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('seatId', pipe) seatId: string,
    @Body(zodPipe(inventoryStateInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.state(actorOf(request), this.key(request), branchId, 'seat', seatId, body),
    );
  }
  @Post('room-types/:roomTypeId/archive')
  @HttpCode(200)
  @command(
    object({ reason }),
    'PROP-002 / ACC-001/004: archive room type and retain booking history',
    'archiveRoomType',
  )
  archiveRoomType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
    @Body(zodPipe(inventoryArchiveInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.archive(
        actorOf(request),
        this.key(request),
        branchId,
        'room_type',
        roomTypeId,
        body,
      ),
    );
  }
  @Post('rooms/:roomId/archive')
  @HttpCode(200)
  @command(
    object({ reason }),
    'PROP-002 / ACC-001/004: archive room and retain booking history',
    'archiveRoom',
  )
  archiveRoom(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomId', pipe) roomId: string,
    @Body(zodPipe(inventoryArchiveInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.archive(actorOf(request), this.key(request), branchId, 'room', roomId, body),
    );
  }
  @Post('seats/:seatId/archive')
  @HttpCode(200)
  @command(
    object({ reason }),
    'PROP-002 / ACC-001/004: archive seat and retain booking history',
    'archiveBed',
  )
  archiveSeat(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('seatId', pipe) seatId: string,
    @Body(zodPipe(inventoryArchiveInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.archive(actorOf(request), this.key(request), branchId, 'seat', seatId, body),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, work: ReturnType<InventoryService['archive']>) {
    const result = await work;
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

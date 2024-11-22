import { Body, Controller, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { setupRoomInputSchema, stayIdentifierSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import { INVENTORY_SERVICE } from './controller.js';
import { InventoryService } from './service.js';
import { object, identifier, mutationDocumentation } from './documentation.js';
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Inventory setup')
@Controller('branches/:branchId/inventory/setup-rooms')
export class SetupRoomController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Post()
  @CookieCsrf()
  @ApiOperation({
    operationId: 'createSetupRoom',
    summary: 'ROOM-002 / CHG-057: create an empty room; beds determine its capacity',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({
    schema: object({ label: { type: 'string', minLength: 1, maxLength: 80 }, floorId: identifier }),
  })
  @ApiResponse({ status: 201, schema: mutationDocumentation })
  async create(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(stayIdentifierSchema)) branch: string,
    @Body(zodPipe(setupRoomInputSchema)) input: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.createSetupRoom(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      branch,
      input,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

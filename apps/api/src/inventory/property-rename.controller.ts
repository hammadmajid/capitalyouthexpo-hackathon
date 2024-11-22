import { Body, Controller, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import {
  propertyRenameInputSchema,
  propertyRenameKindSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import { INVENTORY_SERVICE } from './controller.js';
import { InventoryService } from './service.js';
import { object, identifier } from './documentation.js';

const inputDoc = object({
  name: { type: 'string', minLength: 1, maxLength: 120 },
  expectedName: { type: 'string', minLength: 1, maxLength: 120 },
});
const id = zodPipe(stayIdentifierSchema);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Inventory metadata')
@Controller('branches/:branchId/inventory/metadata/:kind/:targetId/rename')
export class PropertyRenameController {
  constructor(@Inject(INVENTORY_SERVICE) private readonly service: InventoryService) {}
  @Post()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiOperation({
    operationId: 'renameProperty',
    summary: 'ROOM-002 / BED-001: rename inventory metadata without changing financial history',
  })
  @ApiBody({ schema: inputDoc })
  @ApiResponse({
    status: 200,
    schema: object({
      id: identifier,
      branchId: identifier,
      kind: { type: 'string', enum: ['building', 'floor', 'room', 'seat'] },
      name: { type: 'string' },
    }),
  })
  async rename(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branch: string,
    @Param('targetId', id) target: string,
    @Param('kind', zodPipe(propertyRenameKindSchema)) kind: unknown,
    @Body(zodPipe(propertyRenameInputSchema)) input: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.rename(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      branch,
      kind,
      target,
      input,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

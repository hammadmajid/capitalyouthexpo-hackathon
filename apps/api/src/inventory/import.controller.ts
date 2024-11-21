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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  inventoryImportInputSchema,
  inventoryImportKindSchema,
  inventoryImportPageQuerySchema,
} from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { InventoryImportService } from './import.service.js';
import {
  importIdentityDocumentation,
  importInputDocumentation,
  importPreviewDocumentation,
  importTemplateDocumentation,
} from './import.documentation.js';
export const INVENTORY_IMPORT_SERVICE = Symbol('InventoryImportService');
const id = z.string().uuid(),
  pipe = zodPipe(id);
@BranchScope()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 3 inventory CSV import')
@Controller('branches/:branchId/inventory/imports')
export class InventoryImportController {
  constructor(@Inject(INVENTORY_IMPORT_SERVICE) private readonly service: InventoryImportService) {}
  @Get('templates/:kind')
  @ApiQuery({ name: 'roomTypeId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    operationId: 'inventoryImportTemplate',
    summary: 'PROP-001 / ACC-004: scoped approved CSV template',
  })
  @ApiResponse({ status: 200, schema: importTemplateDocumentation })
  template(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branch: string,
    @Param('kind', zodPipe(inventoryImportKindSchema)) kind: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.template(actorOf(request), branch, kind, query);
  }
  @Get(':runId')
  @ApiQuery({
    name: 'offset',
    required: false,
    schema: { type: 'integer', minimum: 0, maximum: 500 },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiOperation({
    operationId: 'readInventoryImport',
    summary: 'PROP-001 / ACC-004: bounded private import preview and row errors',
  })
  @ApiResponse({ status: 200, schema: importPreviewDocumentation })
  read(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branch: string,
    @Param('runId', pipe) run: string,
    @Query(zodPipe(inventoryImportPageQuerySchema)) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), branch, run, query);
  }
  @Post()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: importInputDocumentation })
  @ApiResponse({ status: 201, schema: importIdentityDocumentation })
  @ApiOperation({
    operationId: 'validateInventoryImport',
    summary: 'PROP-001: validate scanned CSV without creating inventory',
  })
  validate(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branch: string,
    @Body(zodPipe(inventoryImportInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.validate(
        actorOf(request),
        id.parse(request.headers['idempotency-key']),
        branch,
        body,
      ),
    );
  }
  @Post(':runId/commit')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: { type: 'object', properties: {}, additionalProperties: false } })
  @ApiResponse({ status: 200, schema: importIdentityDocumentation })
  @ApiOperation({
    operationId: 'commitInventoryImport',
    summary: 'PROP-001 / ACC-004: revalidate and atomically commit all CSV records',
  })
  commit(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branch: string,
    @Param('runId', pipe) run: string,
    @Body(zodPipe(z.object({}).strict())) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.commit(
        actorOf(request),
        id.parse(request.headers['idempotency-key']),
        branch,
        run,
        body,
      ),
    );
  }
  private async respond(
    reply: FastifyReply,
    value: ReturnType<InventoryImportService['validate']>,
  ) {
    const result = await value;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

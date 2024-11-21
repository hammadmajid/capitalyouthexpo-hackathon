import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { adminExplorerKindSchema } from '@hsm/contracts';
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { contractObject, idPipe } from '../services/http.js';
import { zodPipe } from '../problem.js';
import type { AdminExplorerService } from './explorer.service.js';
export const ADMIN_EXPLORER = Symbol('AdminExplorer');
const kindPipe = zodPipe(adminExplorerKindSchema);
@Controller('admin/explorer')
@Admin(['verification'], true)
@ApiTags('Root operational directories')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
export class AdminExplorerController {
  constructor(@Inject(ADMIN_EXPLORER) private readonly service: AdminExplorerService) {}
  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminExplorerSummary',
    summary: 'HMA-017: authoritative Root directory snapshot counts',
  })
  @ApiResponse({ status: 200, schema: contractObject('adminExplorerSummarySchema') })
  summary(@Req() request: FastifyRequest) {
    return this.service.summary(actorOf(request));
  }
  @Get(':kind')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminExplorerList',
    summary:
      'HMA-017: Root searchable, sorted and paged metadata directory with calendar-cohort statistics',
  })
  @ApiParam({ name: 'kind', enum: adminExplorerKindSchema.options })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'status', required: false, schema: { type: 'string', maxLength: 40 } })
  @ApiQuery({ name: 'period', required: false, enum: ['month', 'quarter', 'year', 'lifetime'] })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'oldest', 'name_asc', 'name_desc'] })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', maxLength: 2000 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiQuery({ name: 'parentId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'ownerId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'managerId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, schema: contractObject('adminExplorerPageSchema') })
  list(
    @Req() request: FastifyRequest,
    @Param('kind', kindPipe) kind: string,
    @Query() query: unknown,
  ) {
    return this.service.list(actorOf(request), kind, query);
  }
  @Get(':kind/:id')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminExplorerDetail',
    summary: 'HMA-017: audited metadata profile with authorized relationship drill-downs',
  })
  @ApiParam({ name: 'kind', enum: adminExplorerKindSchema.options })
  @ApiParam({ name: 'id', schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, schema: contractObject('adminExplorerDetailSchema') })
  detail(
    @Req() request: FastifyRequest,
    @Param('kind', kindPipe) kind: string,
    @Param('id', idPipe) id: string,
  ) {
    return this.service.detail(actorOf(request), kind, id);
  }
}

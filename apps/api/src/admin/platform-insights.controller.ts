import { Controller, Get, Header, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { contractObject } from '../services/http.js';
import type { PlatformInsightsService } from './platform-insights.service.js';
export const PLATFORM_INSIGHTS = Symbol('PlatformInsights');
@ApiTags('Platform aggregates and audit metadata')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('admin')
export class PlatformInsightsController {
  constructor(@Inject(PLATFORM_INSIGHTS) private readonly service: PlatformInsightsService) {}
  @Get('audit-log/export')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'actorId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'action', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'targetType', required: false, schema: { type: 'string', maxLength: 80 } })
  @ApiQuery({ name: 'from', required: false, schema: { type: 'string', format: 'date' } })
  @ApiQuery({ name: 'to', required: false, schema: { type: 'string', format: 'date' } })
  @ApiOperation({
    operationId: 'exportPlatformAudit',
    summary: 'AUD-001 RPT-001: audited metadata-only CSV, at most 5000 rows',
  })
  @ApiResponse({ status: 200, content: { 'text/csv': { schema: { type: 'string' } } } })
  async exportAudit(
    @Req() request: FastifyRequest,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const file = await this.service.exportAudit(actorOf(request), query);
    reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="' + file.filename + '"')
      .header('X-HSM-Report-Truncated', String(file.truncated))
      .header('X-Content-Type-Options', 'nosniff');
    return file.body;
  }
  @Get('overview')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'from', required: true, schema: { type: 'string', format: 'date' } })
  @ApiQuery({ name: 'to', required: true, schema: { type: 'string', format: 'date' } })
  @ApiOperation({
    operationId: 'platformOverview',
    summary: 'RPT-003: Root platform snapshot and Karachi-date cohort metrics',
  })
  @ApiResponse({ status: 200, schema: contractObject('platformOverviewSchema') })
  overview(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.overview(actorOf(request), query);
  }
  @Get('audit-log')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', maxLength: 80 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'actorId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'action', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'targetType', required: false, schema: { type: 'string', maxLength: 80 } })
  @ApiQuery({ name: 'from', required: false, schema: { type: 'string', format: 'date' } })
  @ApiQuery({ name: 'to', required: false, schema: { type: 'string', format: 'date' } })
  @ApiOperation({
    operationId: 'platformAudit',
    summary: 'AUD-001 SEC-003: Root paged audit metadata only',
  })
  // Public schema identifier, not a credential.
  // eslint-disable-next-line no-secrets/no-secrets
  @ApiResponse({ status: 200, schema: contractObject('platformAuditPageSchema') })
  audit(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.audit(actorOf(request), query);
  }
}

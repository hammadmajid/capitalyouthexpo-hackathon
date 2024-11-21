import { Controller, Get, Header, Inject, Param, Query, Req, Res } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  REPORT_TRUNCATED_HEADER,
  reportTypeSchema,
  reportFilterPolicy,
  reportOptionFieldSchema,
  dashboardQueueKindSchema,
} from '@hsm/contracts';
import { BranchScope, Owner, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { identifier } from '../inventory/documentation.js';
import { contractObject, date, idPipe } from '../services/http.js';
import type { DashboardService } from './dashboard.service.js';
import type { ReportFile, ReportService } from './reports.service.js';
export const INSIGHTS = Symbol('Insights');
export type Insights = { dashboards: DashboardService; reports: ReportService };
const reportQueries = [
  { name: 'from', required: false, schema: date },
  { name: 'to', required: false, schema: date },
  { name: 'branchIds', required: false, schema: { type: 'array' as const, items: identifier } },
  { name: 'format', required: false, enum: ['json', 'csv', 'pdf'] },
] as const;
const reportHeaders = {
  [REPORT_TRUNCATED_HEADER]: {
    description: 'true when the result contains only the first 5000 matching rows; otherwise false',
    schema: { type: 'string' as const, enum: ['true', 'false'] },
  },
};
const filterQueries = [
  { name: 'buildingId', required: false, schema: identifier },
  { name: 'floorId', required: false, schema: identifier },
  { name: 'roomId', required: false, schema: identifier },
  {
    name: 'residentId',
    required: false,
    schema: identifier,
    description:
      'Resident identity in the selected branch; inapplicable to occupancy and bookings.',
  },
  {
    name: 'status',
    required: false,
    enum: [...new Set(Object.values(reportFilterPolicy).flatMap((policy) => policy.statuses))],
    description:
      'Existing report-family state. Unsupported states and payment-history status reject with 400.',
  },
] as const;
function send(reply: FastifyReply, file: ReportFile) {
  reply
    .header('Content-Type', file.contentType)
    .header('Content-Disposition', `attachment; filename="${file.filename}"`)
    .header(REPORT_TRUNCATED_HEADER, String(file.report.truncated))
    .header('Cache-Control', 'no-store')
    .header('X-Content-Type-Options', 'nosniff');
  return file.body;
}
@ApiTags('Phase 10 dashboards and reports')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class InsightsController {
  constructor(@Inject(INSIGHTS) private readonly insights: Insights) {}
  @Get('branches/:branchId/dashboard/queues/:queue')
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'queue', enum: dashboardQueueKindSchema.options })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiOperation({
    operationId: 'branchDashboardQueue',
    summary: 'AUD-009 / OWN-003 / MGRD-004: exact scoped operational queue',
  })
  @ApiResponse({ status: 200, schema: contractObject('dashboardQueuePageSchema') })
  queue(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('queue') queue: string,
    @Query() query: unknown,
  ) {
    return this.insights.dashboards.queue(actorOf(request), branchId, queue, query);
  }
  @Get('owner/dashboard')
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
  })
  @Owner()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'branchId', required: false, schema: identifier })
  @ApiQuery({
    name: 'month',
    required: false,
    schema: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
  })
  @ApiOperation({
    operationId: 'ownerDashboard',
    summary: 'OWN-001..003: owned branches, totals and actions required',
  })
  @ApiResponse({ status: 200, schema: contractObject('ownerDashboardSchema') })
  owner(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.insights.dashboards.owner(actorOf(request), query);
  }
  @Get('owner/analytics')
  @Owner()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'from', required: true, schema: date })
  @ApiQuery({ name: 'to', required: true, schema: date })
  @ApiOperation({
    operationId: 'ownerAnalytics',
    summary: 'RPT-003/004: booking funnel and response times (advisory)',
  })
  @ApiResponse({ status: 200, schema: contractObject('analyticsSchema') })
  analytics(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.insights.dashboards.analytics(actorOf(request), query);
  }
  @Get('owner/reports/:type')
  @Owner()
  @ApiParam({ name: 'type', enum: reportTypeSchema.options })
  @ApiQuery(reportQueries[0])
  @ApiQuery(reportQueries[1])
  @ApiQuery(reportQueries[2])
  @ApiQuery(reportQueries[3])
  @ApiQuery(filterQueries[0])
  @ApiQuery(filterQueries[1])
  @ApiQuery(filterQueries[2])
  @ApiQuery(filterQueries[3])
  @ApiQuery(filterQueries[4])
  @ApiOperation({
    operationId: 'ownerReport',
    summary: 'RPT-001/002 / OWN-004: cross-branch report as JSON, CSV or PDF',
  })
  @ApiResponse({
    status: 200,
    schema: contractObject('reportSchema (JSON) or a CSV/PDF file'),
    headers: reportHeaders,
  })
  async ownerReport(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('type') type: string,
    @Query() query: unknown,
  ) {
    return send(reply, await this.insights.reports.owner(actorOf(request), type, query));
  }
  @Get('branches/:branchId/dashboard')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchDashboard',
    summary: 'MGRD-001..005: assigned-branch operations',
  })
  @ApiResponse({ status: 200, schema: contractObject('managerDashboardSchema') })
  manager(@Req() request: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.insights.dashboards.manager(actorOf(request), branchId);
  }
  @Get('branches/:branchId/reports/:type')
  @BranchScope('branchId')
  @ApiParam({ name: 'type', enum: reportTypeSchema.options })
  @ApiQuery(reportQueries[0])
  @ApiQuery(reportQueries[1])
  @ApiQuery(reportQueries[3])
  @ApiQuery(filterQueries[0])
  @ApiQuery(filterQueries[1])
  @ApiQuery(filterQueries[2])
  @ApiQuery(filterQueries[3])
  @ApiQuery(filterQueries[4])
  @ApiOperation({
    operationId: 'branchReport',
    summary: 'RPT-001/002: branch report (finance_view or stay_manage)',
  })
  @ApiResponse({
    status: 200,
    schema: contractObject('reportSchema (JSON) or a CSV/PDF file'),
    headers: reportHeaders,
  })
  async branchReport(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('type') type: string,
    @Query() query: unknown,
  ) {
    return send(reply, await this.insights.reports.branch(actorOf(request), branchId, type, query));
  }
  @Get('branches/:branchId/reports/:type/options')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'type', enum: reportTypeSchema.options })
  @ApiQuery({ name: 'field', required: true, enum: reportOptionFieldSchema.options })
  @ApiQuery({ name: 'buildingId', required: false, schema: identifier })
  @ApiQuery({ name: 'floorId', required: false, schema: identifier })
  @ApiQuery({ name: 'search', required: false, schema: { type: 'string', maxLength: 80 } })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiOperation({
    operationId: 'reportFilterOptions',
    summary: 'RPT-001 / SEC-003: bounded names under this report’s live authority',
  })
  @ApiResponse({ status: 200, schema: contractObject('reportOptionPageSchema') })
  reportOptions(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('type') type: string,
    @Query() query: unknown,
  ) {
    return this.insights.reports.options(actorOf(request), branchId, type, query);
  }
}

import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { contractObject, idPipe } from '../services/http.js';
import type { ModerationReadService } from './moderation-read.service.js';
export const MODERATION_READ = Symbol('ModerationRead');
const statuses = ['published', 'hidden', 'removed'];
const limit = {
  name: 'limit',
  required: false,
  schema: { type: 'integer' as const, minimum: 1, maximum: 50, default: 20 },
};
const cursor = { name: 'cursor', required: false, schema: { type: 'string' as const } };
@ApiTags('Platform moderation readers')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('admin/moderation')
export class ModerationReadController {
  constructor(@Inject(MODERATION_READ) private readonly service: ModerationReadService) {}
  @Get('reports')
  @Admin(['content_moderator'])
  @Header('Cache-Control', 'no-store')
  @ApiQuery(limit)
  @ApiQuery(cursor)
  @ApiQuery({
    name: 'reportStatus',
    required: false,
    enum: ['open', 'investigating', 'actioned', 'dismissed'],
  })
  @ApiQuery({ name: 'reviewStatus', required: false, enum: statuses })
  @ApiQuery({ name: 'reviewId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({
    operationId: 'moderationReports',
    summary: 'REV-006: bounded review reports by status',
  })
  @ApiResponse({ status: 200, schema: contractObject('reviewReportQueueSchema') })
  reports(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.reports(actorOf(request), query);
  }
  @Get('reviews')
  @Admin(['content_moderator'])
  @Header('Cache-Control', 'no-store')
  @ApiQuery(limit)
  @ApiQuery(cursor)
  @ApiQuery({ name: 'status', required: false, enum: statuses })
  @ApiOperation({
    operationId: 'moderatedReviews',
    summary: 'REV-006: hidden/removed review restoration discovery',
  })
  @ApiResponse({ status: 200, schema: contractObject('moderatedReviewPageSchema') })
  reviews(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.reviews(actorOf(request), query);
  }
  @Get('reviews/:reviewId')
  @Admin(['content_moderator'])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'moderationReview',
    summary: 'REV-006: current review state without private author identity',
  })
  @ApiResponse({ status: 200, schema: contractObject('moderationReviewSchema') })
  detail(@Req() request: FastifyRequest, @Param('reviewId', idPipe) reviewId: string) {
    return this.service.detail(actorOf(request), reviewId);
  }
  @Get('reviews/:reviewId/history')
  @Admin(['content_moderator'])
  @Header('Cache-Control', 'no-store')
  @ApiQuery(limit)
  @ApiQuery(cursor)
  @ApiOperation({
    operationId: 'moderationHistory',
    summary: 'REV-006 AUD-003: ordered policy-decision history',
  })
  @ApiResponse({ status: 200, schema: contractObject('moderationHistoryPageSchema') })
  history(
    @Req() request: FastifyRequest,
    @Param('reviewId', idPipe) reviewId: string,
    @Query() query: unknown,
  ) {
    return this.service.history(actorOf(request), reviewId, query);
  }
}

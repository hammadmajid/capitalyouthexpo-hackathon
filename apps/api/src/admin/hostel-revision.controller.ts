import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
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
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { idPipe, idempotencyHeader, replay } from '../services/http.js';
import type { HostelRevisionReviewService } from './hostel-revision-review.service.js';
import {
  revisionDecisionDocumentation,
  revisionDocumentation,
  revisionQueueDocumentation,
  revisionReviewDocumentation,
} from '../management/hostel-revision.documentation.js';
export const HOSTEL_REVISION_REVIEW = Symbol('HostelRevisionReview');
// CHG-041 / ADM-007: verification Admins review edits to approved hostels.
@ApiTags('Verification review')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Admin(['verification'])
@Controller('admin/hostel-revisions')
export class HostelRevisionReviewController {
  constructor(
    @Inject(HOSTEL_REVISION_REVIEW) private readonly review: HostelRevisionReviewService,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @ApiResponse({ status: 200, schema: revisionQueueDocumentation })
  @ApiOperation({ summary: 'CHG-041: approved hostels with changes waiting for review' })
  queue(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.review.queue(actorOf(request), query);
  }
  @Get(':revisionId')
  @Header('Cache-Control', 'no-store')
  @ApiResponse({ status: 200, schema: revisionReviewDocumentation })
  @ApiOperation({ summary: 'CHG-041: proposed changes beside the live hostel' })
  read(@Req() request: FastifyRequest, @Param('revisionId', idPipe) revisionId: string) {
    return this.review.read(actorOf(request), revisionId);
  }
  @Post(':revisionId/decision')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiBody({ schema: revisionDecisionDocumentation })
  @ApiResponse({ status: 200, schema: revisionDocumentation })
  @ApiOperation({ summary: 'CHG-041: approve (publish) or reject the waiting changes' })
  async decide(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('revisionId', idPipe) revisionId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.review.decide(
        actorOf(request),
        request.headers['idempotency-key'],
        revisionId,
        body,
      ),
    );
  }
}

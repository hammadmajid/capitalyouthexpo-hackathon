import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Put,
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
  type SchemaObject,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  complaintCategorySchema,
  complaintStatusSchema,
  reviewCategorySchema,
} from '@hsm/contracts';
import { BranchScope, Public, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object } from '../inventory/documentation.js';
import type { ComplaintService } from './complaints.service.js';
import type { ReviewService } from './reviews.service.js';
import { contractObject, idPipe, idempotencyHeader, replay, version } from './http.js';
export const RESIDENT_FEEDBACK = Symbol('ResidentFeedback');
export type ResidentFeedback = { complaints: ComplaintService; reviews: ReviewService };
const detail = contractObject('complaintDetailSchema');
const complaintPage = contractObject('complaintPageSchema');
const download = contractObject('downloadResponseSchema: { url, expiresAt }');
const review = contractObject('ownReviewSchema');
const text = (max: number): SchemaObject => ({ type: 'string', maxLength: max });
const ratings = object(
  Object.fromEntries(
    reviewCategorySchema.options.map((key) => [key, { type: 'integer', minimum: 1, maximum: 5 }]),
  ),
);
const listQueries = [
  { name: 'status', required: false, enum: complaintStatusSchema.options },
  { name: 'category', required: false, enum: complaintCategorySchema.options },
  { name: 'cursor', required: false, schema: identifier },
  { name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 50 } },
] as const;
const staffAction: SchemaObject = {
  oneOf: [
    object({
      action: { type: 'string', enum: ['assign'] },
      expectedVersion: version,
      assigneeUserId: identifier,
    }),
    object({ action: { type: 'string', enum: ['start'] }, expectedVersion: version }),
    object({
      action: { type: 'string', enum: ['resolve'] },
      expectedVersion: version,
      note: text(2000),
    }),
    object({
      action: { type: 'string', enum: ['note'] },
      expectedVersion: version,
      note: text(2000),
    }),
  ],
};
const residentAction: SchemaObject = {
  oneOf: [
    object({ action: { type: 'string', enum: ['accept'] }, expectedVersion: version }),
    object({
      action: { type: 'string', enum: ['reopen'] },
      expectedVersion: version,
      note: text(2000),
    }),
  ],
};
@ApiTags('Phase 9 complaints and reviews')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class ResidentFeedbackController {
  constructor(@Inject(RESIDENT_FEEDBACK) private readonly feedback: ResidentFeedback) {}
  @Post('me/stays/:stayId/complaints')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'createComplaint',
    summary: 'CMP-001..003: complaint on the own active Stay',
  })
  @ApiBody({
    schema: object(
      {
        category: { type: 'string', enum: complaintCategorySchema.options },
        title: text(120),
        description: text(2000),
        attachmentFileIds: { type: 'array', maxItems: 5, items: identifier },
      },
      ['attachmentFileIds'],
    ),
  })
  @ApiResponse({ status: 201, schema: detail })
  async create(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.complaints.create(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        body,
      ),
    );
  }
  @Get('me/stays/:stayId/complaints')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiQuery(listQueries[0])
  @ApiQuery(listQueries[1])
  @ApiQuery(listQueries[2])
  @ApiQuery(listQueries[3])
  @ApiOperation({
    operationId: 'ownComplaints',
    summary: 'CMP-001: own complaints (active and past Stays)',
  })
  @ApiResponse({ status: 200, schema: complaintPage })
  ownPage(
    @Req() request: FastifyRequest,
    @Param('stayId', idPipe) stayId: string,
    @Query() query: unknown,
  ) {
    return this.feedback.complaints.ownPage(actorOf(request), stayId, query);
  }
  @Get('me/stays/:stayId/complaints/:complaintId')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'ownComplaint', summary: 'p.33: detail with full history' })
  @ApiResponse({ status: 200, schema: detail })
  ownDetail(
    @Req() request: FastifyRequest,
    @Param('stayId', idPipe) stayId: string,
    @Param('complaintId', idPipe) complaintId: string,
  ) {
    return this.feedback.complaints.ownDetail(actorOf(request), stayId, complaintId);
  }
  @Post('me/stays/:stayId/complaints/:complaintId/actions')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'complaintResidentAction',
    summary: 'CMP-004: accept the resolution or reopen it',
  })
  @ApiBody({ schema: residentAction })
  @ApiResponse({ status: 200, schema: detail })
  async residentAct(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Param('complaintId', idPipe) complaintId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.complaints.residentAct(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        complaintId,
        body,
      ),
    );
  }
  @Get('me/stays/:stayId/complaints/:complaintId/attachments/:fileId')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownComplaintAttachment',
    summary: 'CMP-003: short-lived private link',
  })
  @ApiResponse({ status: 200, schema: download })
  ownAttachment(
    @Req() request: FastifyRequest,
    @Param('stayId', idPipe) stayId: string,
    @Param('complaintId', idPipe) complaintId: string,
    @Param('fileId', idPipe) fileId: string,
  ) {
    return this.feedback.complaints.attachment(actorOf(request), complaintId, fileId, { stayId });
  }
  @Get('branches/:branchId/complaints')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery(listQueries[0])
  @ApiQuery(listQueries[1])
  @ApiQuery(listQueries[2])
  @ApiQuery(listQueries[3])
  @ApiOperation({ operationId: 'branchComplaints', summary: 'CMP-005: branch complaint queue' })
  @ApiResponse({ status: 200, schema: complaintPage })
  staffPage(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.feedback.complaints.staffPage(actorOf(request), branchId, query);
  }
  @Get('branches/:branchId/complaints-stats')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchComplaintStats',
    summary: 'CMP-005: counts and average resolution time',
  })
  @ApiResponse({ status: 200, schema: contractObject('complaintStatsSchema') })
  stats(@Req() request: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.feedback.complaints.stats(actorOf(request), branchId);
  }
  @Get('branches/:branchId/complaints/:complaintId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchComplaint',
    summary: 'p.33: detail with history and attachments',
  })
  @ApiResponse({ status: 200, schema: detail })
  staffDetail(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('complaintId', idPipe) complaintId: string,
  ) {
    return this.feedback.complaints.staffDetail(actorOf(request), branchId, complaintId);
  }
  @Post('branches/:branchId/complaints/:complaintId/actions')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'complaintStaffAction',
    summary: 'CMP-004: assign, start, resolve or note (stay_manage)',
  })
  @ApiBody({ schema: staffAction })
  @ApiResponse({ status: 200, schema: detail })
  async staffAct(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('complaintId', idPipe) complaintId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.complaints.staffAct(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        complaintId,
        body,
      ),
    );
  }
  @Get('branches/:branchId/complaints/:complaintId/attachments/:fileId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchComplaintAttachment',
    summary: 'CMP-003: short-lived private link (audited)',
  })
  @ApiResponse({ status: 200, schema: download })
  staffAttachment(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('complaintId', idPipe) complaintId: string,
    @Param('fileId', idPipe) fileId: string,
  ) {
    return this.feedback.complaints.attachment(actorOf(request), complaintId, fileId, { branchId });
  }
  @Get('me/stays/:stayId/review-eligibility')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'reviewEligibility',
    summary: 'REV-001..003: server-side eligibility',
  })
  @ApiResponse({ status: 200, schema: contractObject('reviewEligibilitySchema') })
  eligibility(@Req() request: FastifyRequest, @Param('stayId', idPipe) stayId: string) {
    return this.feedback.reviews.checkEligibility(actorOf(request), stayId);
  }
  @Get('me/stays/:stayId/review')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'ownReview', summary: 'REV: own review with moderation state' })
  @ApiResponse({ status: 200, schema: review })
  ownReview(@Req() request: FastifyRequest, @Param('stayId', idPipe) stayId: string) {
    return this.feedback.reviews.own(actorOf(request), stayId);
  }
  @Post('me/stays/:stayId/review')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'createReview',
    summary: 'REV-001..004: one verified review per Stay',
  })
  @ApiBody({ schema: object({ ratings, body: text(2000) }, ['body']) })
  @ApiResponse({ status: 201, schema: review })
  async createReview(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.reviews.create(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        body,
      ),
    );
  }
  @Patch('me/stays/:stayId/review')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'editReview', summary: 'p.35: author edit; history kept' })
  @ApiBody({ schema: object({ ratings, body: text(2000), expectedVersion: version }, ['body']) })
  @ApiResponse({ status: 200, schema: review })
  async editReview(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.reviews.edit(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        body,
      ),
    );
  }
  @Get('public/branches/:branchId/reviews')
  @Public()
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiOperation({
    operationId: 'publicReviews',
    summary: 'REV: published Verified Stay reviews and rating summary',
  })
  @ApiResponse({ status: 200, schema: contractObject('publicReviewPageSchema') })
  publicReviews(@Param('branchId', idPipe) branchId: string, @Query() query: unknown) {
    return this.feedback.reviews.publicPage(branchId, query);
  }
  @Get('branches/:branchId/reviews')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiOperation({ operationId: 'branchReviews', summary: 'REV-005: reviews with moderation state' })
  @ApiResponse({ status: 200, schema: contractObject('staffReviewPageSchema') })
  staffReviews(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.feedback.reviews.staffPage(actorOf(request), branchId, query);
  }
  @Put('branches/:branchId/reviews/:reviewId/reply')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'replyToReview',
    summary: 'REV-005: public reply (listing_edit); never edits the review',
  })
  @ApiBody({ schema: object({ body: text(1000) }) })
  @ApiResponse({ status: 200, schema: contractObject('staffReviewSchema') })
  async replyToReview(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('reviewId', idPipe) reviewId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.reviews.reply(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        reviewId,
        body,
      ),
    );
  }
  @Post('reviews/:reviewId/reports')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'reportReview',
    summary: 'p.35: report a review for content policy',
  })
  @ApiBody({
    schema: object(
      {
        reason: {
          type: 'string',
          enum: ['harassment', 'spam', 'inappropriate_chat', 'scam', 'other'],
        },
        details: text(1000),
      },
      ['details'],
    ),
  })
  @ApiResponse({
    status: 201,
    schema: object({ reportId: identifier, status: { type: 'string', enum: ['open'] } }),
  })
  async report(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('reviewId', idPipe) reviewId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.feedback.reviews.report(
        actorOf(request),
        request.headers['idempotency-key'],
        reviewId,
        body,
      ),
    );
  }
}

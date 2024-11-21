import {
  Body,
  Controller,
  Get,
  Header,
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
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject, idPipe, idempotencyHeader, replay } from '../services/http.js';
import { PROFILE_REVIEWS, profileReviewKindPipe } from './profile-review.controller.js';
import type { ReviewKind } from './profile-review-context.js';
import type { ProfileReviewService } from './profile-review.service.js';
@Controller('me/profile-reviews')
@Self()
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Own governed profile requests')
export class OwnProfileReviewController {
  constructor(@Inject(PROFILE_REVIEWS) private readonly service: ProfileReviewService) {}
  @Get(':kind')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownProfileReviewList',
    summary: 'HMA-015: own bounded review metadata only',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected', 'cancelled', 'withdrawn'],
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiResponse({ status: 200, schema: contractObject('profileReviewPageSchema') })
  list(
    @Req() request: FastifyRequest,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Query() query: unknown,
  ) {
    return this.service.read.list(actorOf(request), kind, query, true);
  }
  @Post(':kind')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'submitOwnProfileReview',
    summary: 'HMA-015: submit own private correction or photo for controlled review',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiBody({
    schema: {
      oneOf: [
        contractObject('identityCorrectionInputSchema'),
        contractObject('profilePhotoSubmissionSchema'),
      ],
    },
  })
  @ApiResponse({ status: 201, schema: contractObject('profileReviewMetadataSchema') })
  async submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.submit(actorOf(request), request.headers['idempotency-key'], kind, body),
    );
  }
  @Post(':kind/:requestId/cancel')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'cancelOwnProfileReview',
    summary: 'HMA-015: cancel only own pending review revision',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiParam({ name: 'requestId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('profileReviewCancelSchema') })
  @ApiResponse({ status: 200, schema: contractObject('profileReviewMetadataSchema') })
  async cancel(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Param('requestId', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.cancel(
        actorOf(request),
        request.headers['idempotency-key'],
        id,
        kind,
        body,
      ),
    );
  }
  @Post(':kind/:requestId/access')
  @CookieCsrf()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownProfileReviewAccess',
    summary: 'HMA-015: explicit private own-request access',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiParam({ name: 'requestId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('profileReviewAccessSchema') })
  @ApiResponse({ status: 200, schema: contractObject('profileReviewDetailSchema') })
  detail(
    @Req() request: FastifyRequest,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Param('requestId', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.read.detail(actorOf(request), id, kind, body, true);
  }
  @Get(':kind/:requestId/history')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownProfileReviewHistory',
    summary: 'HMA-015: own bounded decision history',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiParam({ name: 'requestId', schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'integer', minimum: 2 } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  // eslint-disable-next-line no-secrets/no-secrets -- public OpenAPI schema identifier
  @ApiResponse({ status: 200, schema: contractObject('profileReviewHistoryPageSchema') })
  history(
    @Req() request: FastifyRequest,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Param('requestId', idPipe) id: string,
    @Query() query: unknown,
  ) {
    return this.service.read.history(actorOf(request), id, kind, query, true);
  }
  @Post(':kind/:requestId/files/:fileId/access')
  @CookieCsrf()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownProfileReviewEvidence',
    summary: 'HMA-015: only own attached clean evidence',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiParam({ name: 'requestId', schema: { type: 'string', format: 'uuid' } })
  @ApiParam({ name: 'fileId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('profileReviewAccessSchema') })
  @ApiResponse({ status: 200, schema: contractObject('downloadResponseSchema') })
  evidence(
    @Req() request: FastifyRequest,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Param('requestId', idPipe) id: string,
    @Param('fileId', idPipe) fileId: string,
    @Body() body: unknown,
  ) {
    return this.service.read.evidence(actorOf(request), id, kind, fileId, body, true);
  }
}

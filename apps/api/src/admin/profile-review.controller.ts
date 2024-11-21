import { zodPipe } from '../problem.js';
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
import { z } from 'zod';
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject, idPipe, idempotencyHeader, replay } from '../services/http.js';
import type { ReviewKind } from './profile-review-context.js';
import type { ProfileReviewService } from './profile-review.service.js';
export const PROFILE_REVIEWS = Symbol('ProfileReviews');
export const profileReviewKindPipe = zodPipe(z.enum(['identity', 'profile_photo']));
@Controller('admin/profile-reviews')
@Admin(['content_moderator'])
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Governed profile review')
export class ProfileReviewController {
  constructor(@Inject(PROFILE_REVIEWS) private readonly service: ProfileReviewService) {}
  @Get('profile_photo/subjects')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'profilePhotoSubjects',
    summary: 'HMA-015: current avatar identities only, no image URLs or contact data',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  // eslint-disable-next-line no-secrets/no-secrets -- public OpenAPI schema identifier
  @ApiResponse({ status: 200, schema: contractObject('profilePhotoSubjectPageSchema') })
  subjects(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.photoSubjects(actorOf(request), query);
  }
  @Post('profile_photo/subjects/:userId/flag')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'flagProfilePhoto',
    summary: 'HMA-015: reasoned moderation case for an existing avatar',
  })
  @ApiParam({ name: 'userId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('profilePhotoSubmissionSchema') })
  @ApiResponse({ status: 201, schema: contractObject('profileReviewMetadataSchema') })
  async flag(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('userId', idPipe) userId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.flagPhoto(
        actorOf(request),
        request.headers['idempotency-key'],
        userId,
        body,
      ),
    );
  }
  @Get(':kind')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminProfileReviewList',
    summary: 'HMA-015: Root identity / moderator photo metadata queue',
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
    return this.service.read.list(actorOf(request), kind, query);
  }
  @Post(':kind/:requestId/access')
  @CookieCsrf()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminProfileReviewAccess',
    summary: 'HMA-015: justified audited sensitive review; identity Root-only',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiParam({ name: 'requestId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('profileReviewAccessSchema') })
  @ApiResponse({ status: 200, schema: contractObject('profileReviewDetailSchema') })
  access(
    @Req() request: FastifyRequest,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Param('requestId', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return this.service.read.detail(actorOf(request), id, kind, body);
  }
  @Post(':kind/:requestId/decisions')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminProfileReviewDecision',
    summary: 'HMA-015: versioned transactional review; identity Root-only',
  })
  @ApiParam({ name: 'kind', enum: ['identity', 'profile_photo'] })
  @ApiParam({ name: 'requestId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('profilePhotoDecisionSchema') })
  @ApiResponse({ status: 200, schema: contractObject('profileReviewMetadataSchema') })
  async decide(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('kind', profileReviewKindPipe) kind: ReviewKind,
    @Param('requestId', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.decide(
        actorOf(request),
        request.headers['idempotency-key'],
        id,
        kind,
        body,
      ),
    );
  }
  @Get(':kind/:requestId/history')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminProfileReviewHistory',
    summary: 'HMA-015: bounded governed decision history',
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
    return this.service.read.history(actorOf(request), id, kind, query);
  }
  @Post(':kind/:requestId/files/:fileId/access')
  @CookieCsrf()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminProfileReviewEvidence',
    summary: 'HMA-015: audited attached private evidence URL only',
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
    return this.service.read.evidence(actorOf(request), id, kind, fileId, body);
  }
}

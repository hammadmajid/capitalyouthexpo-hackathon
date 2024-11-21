import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { bookingDocumentReviewSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { BookingDocumentService } from './documents.service.js';
import { BOOKING_DOCUMENT_SERVICE } from './documents.customer.controller.js';
import {
  DocumentPageQuery,
  DocumentIdempotency,
  ownerDocumentDocumentation,
  ownerDocumentPageDocumentation,
  documentReviewDocumentation,
} from './documents.documentation.js';
const identifier = zodPipe(z.string().uuid());
@BranchScope('branchId', true)
@AuthProblems()
@ApiTags('Owner booking evidence review')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/booking-documents')
export class OwnerBookingDocumentController {
  constructor(@Inject(BOOKING_DOCUMENT_SERVICE) private readonly service: BookingDocumentService) {}
  @Get()
  @DocumentPageQuery()
  @ApiResponse({ status: 200, schema: ownerDocumentPageDocumentation })
  @ApiOperation({
    summary:
      'CHG-008 / SEC-003: Owner-only pending review queue; Managers receive booking status metadata only',
  })
  queue(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.queue(actorOf(request), branchId, query);
  }
  @Post(':documentId/review')
  @HttpCode(200)
  @CookieCsrf()
  @DocumentIdempotency()
  @ApiBody({ schema: documentReviewDocumentation })
  @ApiResponse({ status: 200, schema: ownerDocumentDocumentation })
  @ApiOperation({
    summary: 'CHG-008 / SEC-003: audit an Owner-only pre-confirmation acceptance or rejection',
  })
  async review(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('documentId', identifier) documentId: string,
    @Body(zodPipe(bookingDocumentReviewSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.review(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      documentId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

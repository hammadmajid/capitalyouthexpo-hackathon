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
import { bookingDocumentSubmissionSchema } from '@hsm/contracts';
import { Self, Customer, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { BookingDocumentService } from './documents.service.js';
import {
  DocumentPageQuery,
  DocumentIdempotency,
  ownDocumentDocumentation,
  ownDocumentPageDocumentation,
  documentSubmissionDocumentation,
} from './documents.documentation.js';
export const BOOKING_DOCUMENT_SERVICE = Symbol('BookingDocumentService');
const identifier = zodPipe(z.string().uuid());
@Self()
@AuthProblems()
@ApiTags('Own booking evidence')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('me/booking-documents/:branchId')
export class CustomerBookingDocumentController {
  constructor(@Inject(BOOKING_DOCUMENT_SERVICE) private readonly service: BookingDocumentService) {}
  @Get()
  @DocumentPageQuery()
  @ApiResponse({ status: 200, schema: ownDocumentPageDocumentation })
  @ApiOperation({
    summary: 'SEC-003 / BKG-001: read only own evidence history and reusable file references',
  })
  own(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.own(actorOf(request), branchId, query);
  }
  @Customer()
  @Post()
  @HttpCode(201)
  @CookieCsrf()
  @DocumentIdempotency()
  @ApiBody({ schema: documentSubmissionDocumentation })
  @ApiResponse({ status: 201, schema: ownDocumentDocumentation })
  @ApiOperation({
    summary:
      'CHG-008 / BKG-001: explicitly share own clean approved-type evidence with the hostel Owner',
  })
  async submit(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Body(zodPipe(bookingDocumentSubmissionSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.submit(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

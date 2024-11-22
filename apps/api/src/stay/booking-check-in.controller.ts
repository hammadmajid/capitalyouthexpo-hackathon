import { Body, Controller, Get, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
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
import { bookingAdmissionCommandSchema, stayIdentifierSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import { identifier, object } from '../inventory/documentation.js';
import {
  manualAdmissionInputDocumentation,
  manualAdmissionResultDocumentation,
} from './manual-admission.documentation.js';
import type { BookingCheckInService } from './booking-check-in.service.js';
export const BOOKING_CHECK_IN_SERVICE = Symbol('booking check-in');
const id = zodPipe(stayIdentifierSchema);
const manual = manualAdmissionInputDocumentation.properties?.manual as {
  properties: Record<string, object>;
};
const terms = manual.properties.terms as object;
const commandDocumentation = object(
  {
    policyVersionId: identifier,
    cnic: { type: 'string', pattern: '^(?:[0-9]{13}|[0-9]{5}-[0-9]{7}-[0-9])$' },
    initialBilling: manualAdmissionInputDocumentation.properties?.initialBilling as object,
  },
  ['cnic'],
);
const resultDocumentation = object({
  ...(manualAdmissionResultDocumentation.properties ?? {}),
  bookingId: identifier,
});
const previewDocumentation = object({
  branchId: identifier,
  bookingId: identifier,
  terms,
  cnicOnFile: { type: 'boolean' },
});
@ApiTags('Phase 4 resident admission')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@BranchScope('branchId')
@AuthProblems()
@Controller('branches/:branchId/stays/bookings/:bookingId')
export class BookingCheckInController {
  constructor(@Inject(BOOKING_CHECK_IN_SERVICE) private readonly service: BookingCheckInService) {}
  @Get('terms')
  @ApiParam({ name: 'branchId', required: true, schema: identifier })
  @ApiParam({ name: 'bookingId', required: true, schema: identifier })
  @ApiQuery({ name: 'policyVersionId', required: false, schema: identifier })
  @ApiResponse({ status: 200, schema: previewDocumentation })
  @ApiOperation({
    operationId: 'previewBookingCheckIn',
    summary: 'BKG-004 / STAY-001: agreement terms from the booking captured price and policy',
  })
  preview(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('bookingId', id) bookingId: string,
    @Query(zodPipe(z.object({ policyVersionId: stayIdentifierSchema.optional() }).strict()))
    query: { policyVersionId?: string },
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.preview(actorOf(request), branchId, bookingId, query.policyVersionId);
  }
  @Post('check-in')
  @CookieCsrf()
  @ApiParam({ name: 'branchId', required: true, schema: identifier })
  @ApiParam({ name: 'bookingId', required: true, schema: identifier })
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier })
  @ApiBody({ schema: commandDocumentation })
  @ApiResponse({ status: 201, schema: resultDocumentation })
  @ApiOperation({
    operationId: 'checkInBooking',
    summary:
      'STAY-001 / ACC-001 / BKG-009: atomic confirmed-booking check-in to an active Stay with captured terms',
  })
  async checkIn(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('bookingId', id) bookingId: string,
    @Body(zodPipe(bookingAdmissionCommandSchema)) body: unknown,
  ) {
    const result = await this.service.checkIn(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      branchId,
      bookingId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

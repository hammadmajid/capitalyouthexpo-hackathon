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
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { bookingActionInputSchema, branchBookingPageQuerySchema } from '@hsm/contracts';
import { Customer, BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { BookingActionService } from './actions.service.js';
import {
  bookingDocumentation,
  bookingPageDocumentation,
  actionDocumentation,
} from './documentation.js';
export const BOOKING_ACTION_SERVICE = Symbol('BookingActionService');
const identifier = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  pipe = zodPipe(identifier);
@ApiTags('Phase 2 booking actions')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class BookingActionController {
  constructor(@Inject(BOOKING_ACTION_SERVICE) private readonly service: BookingActionService) {}
  @BranchScope()
  @Get('branches/:branchId/bookings')
  @ApiQuery({ name: 'queue', required: false, enum: ['pending_requests'] })
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiOperation({
    summary: 'ACC-004: list exact-branch booking snapshots without private evidence contents',
  })
  @ApiResponse({ status: 200, schema: bookingPageDocumentation })
  list(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Query(zodPipe(branchBookingPageQuerySchema)) page: unknown,
  ) {
    return this.service.list(actorOf(request), branchId, page);
  }
  @BranchScope()
  @Post('branches/:branchId/bookings/:bookingId/confirm')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: actionDocumentation })
  @ApiResponse({ status: 200, schema: bookingDocumentation })
  @ApiOperation({
    summary: 'ACC-001/004 BKG-004: confirm a live request after inventory/evidence revalidation',
  })
  confirm(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('bookingId', pipe) bookingId: string,
    @Body(zodPipe(bookingActionInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.action(
        actorOf(request),
        this.key(request),
        bookingId,
        'confirm',
        body,
        branchId,
      ),
    );
  }
  @BranchScope()
  @Post('branches/:branchId/bookings/:bookingId/reject')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: actionDocumentation })
  @ApiResponse({ status: 200, schema: bookingDocumentation })
  @ApiOperation({ summary: 'BKG-004: reject a pending request and release inventory atomically' })
  reject(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('bookingId', pipe) bookingId: string,
    @Body(zodPipe(bookingActionInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.action(actorOf(request), this.key(request), bookingId, 'reject', body, branchId),
    );
  }
  @BranchScope()
  @Post('branches/:branchId/bookings/:bookingId/cancel')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: actionDocumentation })
  @ApiResponse({ status: 200, schema: bookingDocumentation })
  @ApiOperation({
    summary: 'BKG-004: audited hostel cancellation retains immutable booking history',
  })
  hostelCancel(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('bookingId', pipe) bookingId: string,
    @Body(zodPipe(bookingActionInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.action(actorOf(request), this.key(request), bookingId, 'cancel', body, branchId),
    );
  }
  @Customer()
  @Post('me/bookings/:bookingId/cancel')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: actionDocumentation })
  @ApiResponse({ status: 200, schema: bookingDocumentation })
  @ApiOperation({ summary: 'BKG-004: cancel only own booking within snapshotted policy' })
  cancel(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', pipe) bookingId: string,
    @Body(zodPipe(bookingActionInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.action(actorOf(request), this.key(request), bookingId, 'cancel', body),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<BookingActionService['action']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

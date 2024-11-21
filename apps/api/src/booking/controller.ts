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
import {
  quoteInputSchema,
  holdInputSchema,
  createBookingInputSchema,
  managementPageSchema,
  type QuoteInput,
  type CreateBookingInput,
} from '@hsm/contracts';
import { Public, Customer, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { BookingService } from './service.js';
import {
  quoteInputDocumentation,
  quoteDocumentation,
  holdInputDocumentation,
  holdDocumentation,
  bookingInputDocumentation,
  bookingDocumentation,
  bookingPageDocumentation,
} from './documentation.js';
export const BOOKING_SERVICE = Symbol('BookingService');
const identifier = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  pipe = zodPipe(identifier);
@ApiTags('Phase 2 booking')
@AuthProblems()
@Controller()
export class BookingController {
  constructor(@Inject(BOOKING_SERVICE) private readonly service: BookingService) {}
  @Public()
  @Post('marketplace/:branchId/quote')
  @HttpCode(200)
  @ApiBody({ schema: quoteInputDocumentation })
  @ApiResponse({ status: 200, schema: quoteDocumentation })
  @ApiOperation({ summary: 'BKG-003/004: quote server-authoritative terms for approved inventory' })
  quote(
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(quoteInputSchema)) input: QuoteInput,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.quote(branchId, input);
  }
  @Customer()
  @Get('me/bookings')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @ApiResponse({ status: 200, schema: bookingPageDocumentation })
  @ApiOperation({ summary: 'BKG-001: list only this Customer booking snapshots' })
  list(@Req() request: FastifyRequest, @Query(zodPipe(managementPageSchema)) page: unknown) {
    return this.service.list(actorOf(request), page);
  }
  @Customer()
  @Post('marketplace/:branchId/holds')
  @HttpCode(201)
  @CookieCsrf()
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: holdInputDocumentation })
  @ApiResponse({ status: 201, schema: holdDocumentation })
  @ApiOperation({ summary: 'BKG-006 ACC-001: atomically hold inventory with server expiry' })
  hold(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(holdInputSchema)) input: z.infer<typeof holdInputSchema>,
  ) {
    return this.respond(
      reply,
      this.service.hold(actorOf(request), this.key(request), branchId, input),
    );
  }
  @Customer()
  @Post('marketplace/:branchId/bookings')
  @HttpCode(201)
  @CookieCsrf()
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: bookingInputDocumentation })
  @ApiResponse({ status: 201, schema: bookingDocumentation })
  @ApiOperation({
    summary: 'BKG-001/004 CHG-007: submit policy-bound private evidence and atomically book',
  })
  create(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(createBookingInputSchema)) input: CreateBookingInput,
  ) {
    return this.respond(
      reply,
      this.service.create(actorOf(request), this.key(request), branchId, input),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond<T>(
    reply: FastifyReply,
    response: Promise<{ status: number; replayed: boolean; body: T }>,
  ) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

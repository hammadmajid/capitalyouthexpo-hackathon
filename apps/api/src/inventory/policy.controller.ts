import { Body, Controller, Inject, Param, Put, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { platformBookingSettingsSchema, bookingOverrideInputSchema } from '@hsm/contracts';
import { Admin, Owner, BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, identifier, nullable } from './documentation.js';
import {
  policyDocumentation,
  policyOverrideDocumentation,
  platformLimitsDocumentation,
} from '../booking/documentation.js';
import { BookingPolicyService } from './policy.service.js';
export const BOOKING_POLICY_SERVICE = Symbol('BookingPolicyService');
const id = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  pipe = zodPipe(id);
const version = object({
  id: identifier,
  level: { type: 'string', enum: ['platform', 'hostel', 'branch', 'room_type'] },
  scopeId: nullable(identifier),
});
const override = object({ overrides: policyOverrideDocumentation });
@ApiTags('Phase 2 policy settings')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class BookingPolicyController {
  constructor(@Inject(BOOKING_POLICY_SERVICE) private readonly service: BookingPolicyService) {}
  @Admin(['verification'], true)
  @Put('admin/booking-policy')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({
    schema: object(
      {
        policy: policyDocumentation,
        limits: platformLimitsDocumentation,
        expectedCurrentVersionId: nullable(identifier),
      },
      ['expectedCurrentVersionId'],
    ),
  })
  @ApiResponse({ status: 200, schema: version })
  @ApiOperation({
    summary: 'BKG-006: Root configures explicit platform defaults and safety limits',
  })
  platform(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body(zodPipe(platformBookingSettingsSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.save(actorOf(request), this.key(request), { level: 'platform' }, body),
    );
  }
  @Owner()
  @Put('owner/brands/:brandId/booking-policy')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: override })
  @ApiResponse({ status: 200, schema: version })
  @ApiOperation({ summary: 'CHG-007: Owner configures hostel booking rules and optional CNIC' })
  hostel(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', pipe) brandId: string,
    @Body(zodPipe(bookingOverrideInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.save(
        actorOf(request),
        this.key(request),
        { level: 'hostel', id: brandId },
        body,
      ),
    );
  }
  @BranchScope()
  @Put('branches/:branchId/booking-policy')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: override })
  @ApiResponse({ status: 200, schema: version })
  @ApiOperation({ summary: 'BKG-006: branch overrides inherit missing/null hostel policy values' })
  branch(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(bookingOverrideInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.save(
        actorOf(request),
        this.key(request),
        { level: 'branch', id: branchId },
        body,
      ),
    );
  }
  @BranchScope()
  @Put('branches/:branchId/inventory/room-types/:roomTypeId/booking-policy')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: override })
  @ApiResponse({ status: 200, schema: version })
  @ApiOperation({
    summary: 'BKG-006: exact-branch room-type overrides version immutable policy terms',
  })
  roomType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
    @Body(zodPipe(bookingOverrideInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.save(
        actorOf(request),
        this.key(request),
        { level: 'room_type', id: roomTypeId, branchId },
        body,
      ),
    );
  }
  private key(request: FastifyRequest) {
    return id.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<BookingPolicyService['save']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

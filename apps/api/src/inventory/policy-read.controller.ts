import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { Admin, Owner, BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { BOOKING_POLICY_SERVICE } from './policy.controller.js';
import { BookingPolicyService } from './policy.service.js';
import { policyReadDocumentation } from './policy-read.documentation.js';
const pipe = zodPipe(
  z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
);
@ApiTags('Phase 2 policy settings')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@ApiResponse({ status: 200, schema: policyReadDocumentation })
@Controller()
export class BookingPolicyReadController {
  constructor(@Inject(BOOKING_POLICY_SERVICE) private readonly service: BookingPolicyService) {}
  @Admin(['verification'], true)
  @Get('admin/booking-policy')
  @ApiOperation({
    operationId: 'readRootPolicy',
    summary: 'BKG-006: Read platform booking defaults and safety limits',
  })
  platform(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query() query: unknown,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), { level: 'platform' }, query);
  }
  @Owner()
  @Get('owner/brands/:brandId/booking-policy')
  @ApiOperation({
    operationId: 'readHostelPolicy',
    summary: 'BKG-006: Read owned hostel policy and inherited settings',
  })
  hostel(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', pipe) id: string,
    @Query() query: unknown,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), { level: 'hostel', id }, query);
  }
  @BranchScope()
  @Get('branches/:branchId/booking-policy')
  @ApiOperation({
    operationId: 'readBranchPolicy',
    summary: 'BKG-006: Read assigned branch policy and edit permission',
  })
  branch(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) id: string,
    @Query() query: unknown,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), { level: 'branch', id }, query);
  }
  @BranchScope()
  @Get('branches/:branchId/inventory/room-types/:roomTypeId/booking-policy')
  @ApiOperation({
    operationId: 'readRoomPolicy',
    summary: 'BKG-006: Read exact branch room-type policy inheritance',
  })
  roomType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) id: string,
    @Query() query: unknown,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), { level: 'room_type', id, branchId }, query);
  }
}

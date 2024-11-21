import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
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
import {
  bookingActionInputSchema,
  bookingProofInputSchema,
  bookingProofReviewSchema,
  paymentInstructionInputSchema,
  upfrontSettingsSchema,
} from '@hsm/contracts';
import { Customer, BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { FileDownloadResponse } from '../files/documentation.js';
import { actionDocumentation, bookingDocumentation } from './documentation.js';
import {
  instructionDocumentation,
  instructionInputDocumentation,
  instructionListDocumentation,
  proofInputDocumentation,
  proofReviewDocumentation,
  upfrontSettingsDocumentation,
} from './upfront.documentation.js';
import type { BookingUpfrontService } from './upfront.service.js';
export const BOOKING_UPFRONT_SERVICE = Symbol('BookingUpfrontService');
const identifier = z
    .string()
    .uuid()
    .transform((value) => value.toLowerCase()),
  pipe = zodPipe(identifier);
const Command = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  });
type Result = { status: number; replayed: boolean; body: unknown };
@ApiTags('Phase 3 booking upfront verification')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class BookingUpfrontController {
  constructor(@Inject(BOOKING_UPFRONT_SERVICE) private readonly service: BookingUpfrontService) {}
  @BranchScope()
  @Post('branches/:branchId/bookings/:bookingId/approve')
  @HttpCode(200)
  @CookieCsrf()
  @Command()
  @ApiBody({ schema: actionDocumentation })
  @ApiResponse({ status: 200, schema: bookingDocumentation })
  @ApiOperation({
    operationId: 'upfrontApprove',
    summary: 'BKG-002 / BKG-007: approve a live upfront request and request direct payment',
  })
  approve(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('bookingId', pipe) bookingId: string,
    @Body(zodPipe(bookingActionInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.approve(actorOf(request), this.key(request), branchId, bookingId, body),
    );
  }
  @Customer()
  @Post('me/bookings/:bookingId/payment-proofs')
  @HttpCode(201)
  @CookieCsrf()
  @Command()
  @ApiBody({ schema: proofInputDocumentation })
  @ApiResponse({ status: 201, schema: bookingDocumentation })
  @ApiOperation({
    operationId: 'proofSubmit',
    summary: 'BKG-008: submit own clean proof of a direct payment to the hostel',
  })
  submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', pipe) bookingId: string,
    @Body(zodPipe(bookingProofInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.submitProof(actorOf(request), this.key(request), bookingId, body),
    );
  }
  @BranchScope()
  @Post('branches/:branchId/bookings/:bookingId/payment-proofs/:proofId/review')
  @HttpCode(200)
  @CookieCsrf()
  @Command()
  @ApiBody({ schema: proofReviewDocumentation })
  @ApiResponse({ status: 200, schema: bookingDocumentation })
  @ApiOperation({
    operationId: 'proofReview',
    summary: 'ACC-004 / BKG-008: approve (and confirm) or reject a submitted upfront proof',
  })
  review(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('bookingId', pipe) bookingId: string,
    @Param('proofId', pipe) proofId: string,
    @Body(zodPipe(bookingProofReviewSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.review(actorOf(request), this.key(request), branchId, bookingId, proofId, body),
    );
  }
  @BranchScope()
  @Get('branches/:branchId/bookings/:bookingId/payment-proofs/:proofId/download')
  @FileDownloadResponse()
  @ApiOperation({
    operationId: 'proofLink',
    summary: 'SEC-003: audited short-lived proof link for an authorized reviewer',
  })
  download(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('bookingId', pipe) bookingId: string,
    @Param('proofId', pipe) proofId: string,
  ) {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    return this.service.proofDownload(actorOf(request), branchId, bookingId, proofId);
  }
  @Customer()
  @Get('me/bookings/:bookingId/payment-instructions')
  @ApiResponse({ status: 200, schema: instructionListDocumentation })
  @ApiOperation({
    operationId: 'payInfo',
    summary: 'BKG-007: where to pay the hostel directly, after payment is requested',
  })
  customerInstructions(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('bookingId', pipe) bookingId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.customerInstructions(actorOf(request), bookingId);
  }
  @BranchScope()
  @Get('branches/:branchId/payment-instructions')
  @ApiResponse({ status: 200, schema: instructionListDocumentation })
  @ApiOperation({
    operationId: 'payInfoList',
    summary: 'BKG-007: current branch payment instructions for booking staff',
  })
  instructions(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.listInstructions(actorOf(request), branchId);
  }
  @BranchScope()
  @Post('branches/:branchId/payment-instructions')
  @HttpCode(201)
  @CookieCsrf()
  @Command()
  @ApiBody({ schema: instructionInputDocumentation })
  @ApiResponse({ status: 201, schema: instructionDocumentation })
  @ApiOperation({
    operationId: 'payInfoAdd',
    summary: 'BKG-007 / AUD-001: Owner adds a direct-to-hostel payment destination',
  })
  createInstruction(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(paymentInstructionInputSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.createInstruction(actorOf(request), this.key(request), branchId, body),
    );
  }
  @BranchScope()
  @Post('branches/:branchId/payment-instructions/:instructionId/archive')
  @HttpCode(200)
  @CookieCsrf()
  @Command()
  @ApiResponse({ status: 200, schema: instructionDocumentation })
  @ApiOperation({
    operationId: 'payInfoArchive',
    summary: 'AUD-001: Owner archives a payment destination; history is retained',
  })
  archiveInstruction(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('instructionId', pipe) instructionId: string,
  ) {
    return this.respond(
      reply,
      this.service.archiveInstruction(actorOf(request), this.key(request), branchId, instructionId),
    );
  }
  @BranchScope()
  @Get('branches/:branchId/upfront-settings')
  @ApiResponse({ status: 200, schema: upfrontSettingsDocumentation })
  @ApiOperation({
    operationId: 'upfrontRead',
    summary: 'BKG-007: current branch upfront payment requirement',
  })
  settings(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.readSettings(actorOf(request), branchId);
  }
  @BranchScope()
  @Put('branches/:branchId/upfront-settings')
  @HttpCode(200)
  @CookieCsrf()
  @Command()
  @ApiBody({ schema: upfrontSettingsDocumentation })
  @ApiResponse({ status: 200, schema: upfrontSettingsDocumentation })
  @ApiOperation({
    operationId: 'upfrontUpdate',
    summary: 'BKG-007 / AUD-001: Owner sets the upfront requirement for future requests',
  })
  updateSettings(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(upfrontSettingsSchema)) body: unknown,
  ) {
    return this.respond(
      reply,
      this.service.updateSettings(actorOf(request), this.key(request), branchId, body),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: Promise<Result>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

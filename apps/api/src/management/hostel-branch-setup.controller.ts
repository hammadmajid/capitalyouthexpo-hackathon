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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { mainBranchDraftInputSchema, type MainBranchDraftInput } from '@hsm/contracts';
import { Owner, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { HOSTEL_SETUP_SERVICE, HostelSetupController } from './hostel-setup.controller.js';
import { HostelSetupService } from './hostel-setup.service.js';
import {
  setupMainInputDocumentation,
  setupReadDocumentation,
  setupStateDocumentation,
} from './hostel-setup.documentation.js';
const identifier = z.string().uuid(),
  idPipe = zodPipe(identifier);
const empty = z.object({}).strict();
const idempotencyHeader = {
  name: 'Idempotency-Key',
  required: true,
  schema: { type: 'string', format: 'uuid' },
} as const;
// BRN-001: additional branches under an owned hostel reuse the six-step setup draft.
@Owner()
@AuthProblems()
@ApiTags('Phase 1 owner hostel setup')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('owner/brands/:brandId/branches')
export class HostelBranchSetupController {
  constructor(@Inject(HOSTEL_SETUP_SERVICE) private readonly service: HostelSetupService) {}
  @Post()
  @HttpCode(201)
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiBody({ schema: setupMainInputDocumentation })
  @ApiResponse({ status: 201, schema: setupStateDocumentation })
  @ApiOperation({
    operationId: 'addOwnerBranch',
    summary: 'BRN-001: add a private draft branch to an owned hostel',
  })
  create(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(mainBranchDraftInputSchema)) input: MainBranchDraftInput,
  ) {
    return this.respond(
      reply,
      this.service.addBranch(actorOf(request), this.key(request), brandId, input),
    );
  }
  @Get(':branchId/onboarding')
  @ApiResponse({ status: 200, schema: setupReadDocumentation })
  @ApiOperation({
    operationId: 'readOwnerBranchSetup',
    summary: 'BRN-001: read an owned branch setup draft',
  })
  read(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Param('branchId', idPipe) branchId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.readBranch(actorOf(request), brandId, branchId);
  }
  @Put(':branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiBody({ schema: setupMainInputDocumentation })
  @ApiResponse({ status: 200, schema: setupStateDocumentation })
  @ApiOperation({
    operationId: 'saveOwnerBranchSetup',
    summary: 'BRN-001: save partial branch setup with exact geography validation',
  })
  save(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Param('branchId', idPipe) branchId: string,
    @Body(zodPipe(mainBranchDraftInputSchema)) input: MainBranchDraftInput,
  ) {
    return this.respond(
      reply,
      this.service.saveBranch(actorOf(request), this.key(request), brandId, branchId, input),
    );
  }
  @Post(':branchId/submit')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiResponse({ status: 200, schema: setupStateDocumentation })
  @ApiOperation({
    operationId: 'submitOwnerBranch',
    summary: 'BRN-001 ONB-001: submit a complete branch for verification',
  })
  submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Param('branchId', idPipe) branchId: string,
    @Body(zodPipe(empty)) input: z.infer<typeof empty>,
  ) {
    return this.respond(
      reply,
      this.service.submitBranch(actorOf(request), this.key(request), brandId, branchId, input),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<HostelSetupService['create']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}
// Hostel and branch setup routes register together behind the same setup service.
export const hostelSetupControllers = [HostelSetupController, HostelBranchSetupController];

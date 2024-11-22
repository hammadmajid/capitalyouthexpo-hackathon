import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  hostelBasicsInputSchema,
  mainBranchDraftInputSchema,
  managementPageSchema,
  type HostelBasicsInput,
  type MainBranchDraftInput,
  type ManagementPage,
} from '@hsm/contracts';
import { Owner, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { HostelSetupService } from './hostel-setup.service.js';
import {
  setupBasicsDocumentation,
  setupMainInputDocumentation,
  setupReadDocumentation,
  setupStateDocumentation,
  setupPageDocumentation,
} from './hostel-setup.documentation.js';
export const HOSTEL_SETUP_SERVICE = Symbol('HostelSetupService');
const identifier = z.string().uuid(),
  idPipe = zodPipe(identifier);
const empty = z.object({}).strict();
@Owner()
@AuthProblems()
@ApiTags('Phase 1 owner hostel setup')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('owner')
export class HostelSetupController {
  constructor(@Inject(HOSTEL_SETUP_SERVICE) private readonly service: HostelSetupService) {}
  @Get('organizations/:orgId/brands')
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, schema: setupPageDocumentation })
  @ApiOperation({ summary: 'OWN-001: list hostels in an exactly owned live organization' })
  list(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('orgId', idPipe) organizationId: string,
    @Query(zodPipe(managementPageSchema)) page: ManagementPage,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.list(actorOf(request), organizationId, page);
  }
  @Get('brands/:brandId/onboarding')
  @ApiResponse({ status: 200, schema: setupReadDocumentation })
  @ApiOperation({ summary: 'OWN-001: read owned private hostel/main-branch setup' })
  read(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), brandId);
  }
  @Post('organizations/:orgId/brands')
  @HttpCode(201)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: setupBasicsDocumentation })
  @ApiResponse({ status: 201, schema: setupStateDocumentation })
  @ApiOperation({
    summary: 'OWN-001 ONB-001: create private hostel and incomplete main branch atomically',
  })
  create(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('orgId', idPipe) organizationId: string,
    @Body(zodPipe(hostelBasicsInputSchema)) input: HostelBasicsInput,
  ) {
    return this.respond(
      reply,
      this.service.create(actorOf(request), this.key(request), organizationId, input),
    );
  }
  @Put('brands/:brandId/basics')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: setupBasicsDocumentation })
  @ApiResponse({ status: 200, schema: setupStateDocumentation })
  @ApiOperation({
    summary: 'OWN-001: save hostel basics without approving or publishing the draft',
  })
  basics(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(hostelBasicsInputSchema)) input: HostelBasicsInput,
  ) {
    return this.respond(
      reply,
      this.service.basics(actorOf(request), this.key(request), brandId, input),
    );
  }
  @Put('brands/:brandId/main-branch')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: setupMainInputDocumentation })
  @ApiResponse({ status: 200, schema: setupStateDocumentation })
  @ApiOperation({
    summary: 'ONB-001: save partial main-branch progress with exact geography validation',
  })
  main(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(mainBranchDraftInputSchema)) input: MainBranchDraftInput,
  ) {
    return this.respond(
      reply,
      this.service.main(actorOf(request), this.key(request), brandId, input),
    );
  }
  @Post('brands/:brandId/submit')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: { type: 'object', additionalProperties: false } })
  @ApiResponse({ status: 200, schema: setupStateDocumentation })
  @ApiOperation({
    summary:
      'ONB-001: submit complete main branch for verification; manager appointment is optional',
  })
  submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(empty)) input: z.infer<typeof empty>,
  ) {
    return this.respond(
      reply,
      this.service.submit(actorOf(request), this.key(request), brandId, input),
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

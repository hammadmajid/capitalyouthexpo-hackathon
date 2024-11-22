import { agreementTemplateInputSchema, transportBillingPolicyInputSchema } from '@hsm/contracts';
import { contractObject } from '../services/http.js';
import { ApiBody, ApiHeader } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object } from '../inventory/documentation.js';
import { Body, Controller, Get, Inject, Param, Put, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { billingSettingsInputSchema, stayIdentifierSchema } from '@hsm/contracts';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { actorOf, BranchScope } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { BillingPolicyService } from './billing-policy.service.js';
import {
  BillingPolicyCommand,
  billingPolicyVersionDocumentation,
  transportBillingDocumentation,
  billingSettingsReadDocumentation,
} from './billing-policy.documentation.js';
export const BILLING_POLICY_SERVICE = Symbol('BillingPolicyService');
const pipe = zodPipe(stayIdentifierSchema),
  empty = zodPipe(z.object({}).strict());
@ApiTags('Phase 3 stay billing policy')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@BranchScope('branchId')
@AuthProblems()
@Controller('branches/:branchId')
export class BillingPolicyController {
  constructor(@Inject(BILLING_POLICY_SERVICE) private readonly service: BillingPolicyService) {}
  @Put('agreement-template')
  @CookieCsrf()
  @ApiOperation({
    operationId: 'saveAgreementTemplate',
    summary:
      'STAY-002: Owner versions future agreement text/document without changing existing stays',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: contractObject('agreementTemplateInputSchema') })
  @ApiResponse({ status: 200, schema: contractObject('billingPolicyVersionSchema') })
  template(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(agreementTemplateInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.respond(
      reply,
      this.service.template(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Get('billing-policy')
  @ApiOperation({
    operationId: 'readBranchBilling',
    summary: 'RENT-001/003: live scoped explicit branch billing policy; absence has no default',
  })
  @ApiResponse({ status: 200, schema: billingSettingsReadDocumentation })
  readBranch(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Query(empty) query: unknown,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), { branchId }, query);
  }
  @Get('inventory/room-types/:roomTypeId/billing-policy')
  @ApiOperation({
    operationId: 'readTypeBilling',
    summary: 'RENT-003 / ACC-004: exact room-type policy and effective immutable version',
  })
  @ApiResponse({ status: 200, schema: billingSettingsReadDocumentation })
  readType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
    @Query(empty) query: unknown,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), { branchId, roomTypeId }, query);
  }
  @Put('billing-policy/transport')
  @CookieCsrf()
  @ApiOperation({
    operationId: 'saveTransportBillingPolicy',
    summary: 'SERV-002: version branch transport billing rules',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier })
  @ApiBody({
    schema: object({
      policyVersionId: identifier,
      transportBilling: transportBillingDocumentation,
    }),
  })
  @ApiResponse({ status: 200, schema: billingPolicyVersionDocumentation })
  transport(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(transportBillingPolicyInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.respond(
      reply,
      this.service.transport(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Put('billing-policy')
  @BillingPolicyCommand()
  @ApiOperation({
    operationId: 'saveBranchBilling',
    summary:
      'RENT-001/003: Owner appends explicit branch policy; prior agreements remain immutable',
  })
  saveBranch(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(billingSettingsInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.respond(
      reply,
      this.service.save(actorOf(request), this.key(request), { branchId }, body),
    );
  }
  @Put('inventory/room-types/:roomTypeId/billing-policy')
  @BillingPolicyCommand()
  @ApiOperation({
    operationId: 'saveTypeBilling',
    summary: 'RENT-003 / ACC-004: Owner versions exact branch room-type billing policy',
  })
  saveType(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
    @Body(zodPipe(billingSettingsInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.respond(
      reply,
      this.service.save(actorOf(request), this.key(request), { branchId, roomTypeId }, body),
    );
  }
  private key(request: FastifyRequest) {
    return stayIdentifierSchema.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<BillingPolicyService['save']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

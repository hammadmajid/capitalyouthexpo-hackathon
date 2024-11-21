import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  listingRuleArchiveSchema,
  listingRuleInputSchema,
  listingRulesQuerySchema,
} from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { ListingRulesService } from './listing-rules.service.js';
import {
  ListingRuleCommand,
  ListingRulesPaging,
  listingRuleArchiveDocumentation,
  listingRuleInputDocumentation,
  listingRuleStateDocumentation,
  privateListingRulesPageDocumentation,
} from './listing-rules.documentation.js';
export const LISTING_RULES_SERVICE = Symbol('ListingRulesService');
const identifier = z.string().uuid(),
  pipe = zodPipe(identifier);
@BranchScope('branchId')
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 2 hostel rules')
@Controller('branches/:branchId/rules')
export class ListingRulesController {
  constructor(@Inject(LISTING_RULES_SERVICE) private readonly service: ListingRulesService) {}
  @Get()
  @ListingRulesPaging(true)
  @ApiOperation({
    operationId: 'listListingRules',
    summary: 'TRUST-006 / ACC-004: bounded scoped active or archived hostel rules',
  })
  @ApiResponse({ status: 200, schema: privateListingRulesPageDocumentation })
  read(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Query(zodPipe(listingRulesQuerySchema)) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), branchId, query);
  }
  @Get(':ruleId')
  @ApiOperation({
    operationId: 'readListingRule',
    summary: 'ACC-004: exact branch child rule and current edit authority',
  })
  @ApiResponse({
    status: 200,
    schema: listingRuleStateDocumentation,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  async one(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('ruleId', pipe) ruleId: string,
    @Query(zodPipe(z.object({}).strict())) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    const result = await this.service.one(actorOf(request), branchId, ruleId, query);
    reply.header('Cache-Control', 'no-store').header('ETag', '"' + result.version + '"');
    return result;
  }
  @Post()
  @ListingRuleCommand(listingRuleInputDocumentation, 201, false)
  @ApiOperation({
    operationId: 'createListingRule',
    summary: 'TRUST-006 / AUD-001: create an audited informational hostel rule',
  })
  create(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(listingRuleInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.create(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Put(':ruleId')
  @ListingRuleCommand(listingRuleInputDocumentation)
  @ApiOperation({
    operationId: 'editListingRule',
    summary: 'TRUST-006 / ACC-004 / AUD-001: versioned scoped informational rule edit',
  })
  edit(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('ruleId', pipe) ruleId: string,
    @Body(zodPipe(listingRuleInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.edit(
        actorOf(request),
        this.key(request),
        branchId,
        ruleId,
        request.headers['if-match'],
        body,
      ),
    );
  }
  @Post(':ruleId/archive')
  @ListingRuleCommand(listingRuleArchiveDocumentation)
  @ApiOperation({
    operationId: 'archiveListingRule',
    summary: 'AUD-001: archive a rule with reason; retain its historical record',
  })
  archive(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('ruleId', pipe) ruleId: string,
    @Body(zodPipe(listingRuleArchiveSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.archive(
        actorOf(request),
        this.key(request),
        branchId,
        ruleId,
        request.headers['if-match'],
        body,
      ),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, operation: ReturnType<ListingRulesService['create']>) {
    const result = await operation;
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed))
      .header('ETag', '"' + result.body.version + '"');
    return result.body;
  }
}

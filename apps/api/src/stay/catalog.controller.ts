import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  billingCatalogInputSchema,
  billingCatalogArchiveSchema,
  billingCatalogQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { BillingCatalogService } from './catalog.service.js';
import {
  CatalogQueries,
  CatalogCreateCommand,
  CatalogArchiveCommand,
  catalogPageDocumentation,
} from './catalog.documentation.js';
export const BILLING_CATALOG_SERVICE = Symbol('BillingCatalogService');
const id = zodPipe(stayIdentifierSchema),
  emptySchema = z.object({}).strict(),
  empty = zodPipe(emptySchema);
@ApiTags('Phase 3 approved charge catalogue')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@BranchScope('branchId')
@AuthProblems()
@Controller('branches/:branchId/charge-catalog')
export class BillingCatalogController {
  constructor(@Inject(BILLING_CATALOG_SERVICE) private readonly service: BillingCatalogService) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  @CatalogQueries()
  @ApiOperation({
    operationId: 'billingCatalogList',
    summary: 'FIN-004 / ACC-004: private Owner or finance_view catalogue; no arbitrary charges',
  })
  @ApiResponse({ status: 200, schema: catalogPageDocumentation })
  read(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Query(zodPipe(billingCatalogQuerySchema)) query: unknown,
  ) {
    return this.service.read(actorOf(request), branchId, query);
  }
  @Post()
  @CatalogCreateCommand()
  @ApiOperation({
    operationId: 'billingCatalogCreate',
    summary: 'FIN-004 / AUD-004: Owner creates an immutable approved price; audited and idempotent',
  })
  create(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Body(zodPipe(billingCatalogInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    emptySchema.parse(query);
    return this.respond(
      reply,
      this.service.create(
        actorOf(request),
        stayIdentifierSchema.parse(request.headers['idempotency-key']),
        branchId,
        body,
      ),
    );
  }
  @Post(':catalogId/archive')
  @CatalogArchiveCommand()
  @ApiOperation({
    operationId: 'billingCatalogArchive',
    summary:
      'FIN-004 / AUD-004: Owner archives one exact catalogue entry; financial history is retained',
  })
  archive(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('catalogId', id) catalogId: string,
    @Body(zodPipe(billingCatalogArchiveSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    emptySchema.parse(query);
    return this.respond(
      reply,
      this.service.archive(
        actorOf(request),
        stayIdentifierSchema.parse(request.headers['idempotency-key']),
        { branchId, catalogId },
        body,
      ),
    );
  }
  private async respond(reply: FastifyReply, pending: ReturnType<BillingCatalogService['create']>) {
    const result = await pending;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

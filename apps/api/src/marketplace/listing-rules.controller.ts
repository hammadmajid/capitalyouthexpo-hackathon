import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import {
  ListingRulesPaging,
  publicListingRulesPageDocumentation,
} from '../inventory/listing-rules.documentation.js';
import { PublicListingRulesService } from './listing-rules.service.js';
export const PUBLIC_LISTING_RULES_SERVICE = Symbol('PublicListingRulesService');
@Public()
@ApiTags('Phase 2 public marketplace')
@Controller('marketplace/:branchId/rules')
export class PublicListingRulesController {
  constructor(
    @Inject(PUBLIC_LISTING_RULES_SERVICE) private readonly service: PublicListingRulesService,
  ) {}
  @Get()
  @ListingRulesPaging()
  @ApiOperation({
    operationId: 'publicListingRules',
    summary: 'ACC-002: bounded current approved hostel rules without private history or identities',
  })
  @ApiResponse({ status: 200, schema: publicListingRulesPageDocumentation })
  read(
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(branchId, query);
  }
}

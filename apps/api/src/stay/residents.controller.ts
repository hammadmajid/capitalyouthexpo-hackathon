import { Body, Controller, Get, Header, Inject, Param, Put, Query, Req } from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import {
  residentContactUpdateSchema,
  residentAccountLinkDecisionSchema,
  residentDirectoryQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { zodPipe } from '../problem.js';
import type { ResidentService } from './residents.service.js';
import { accountLinkPageDocumentation } from './account-link.documentation.js';
import {
  ResidentDirectoryQueries,
  residentDirectoryDocumentation,
  residentContactDocumentation,
  residentContactUpdateDocumentation,
  residentProfileDocumentation,
} from './residents.documentation.js';
export const RESIDENT_SERVICE = Symbol('ResidentService');
const id = zodPipe(stayIdentifierSchema);
@ApiTags('Phase 5 residents')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('branches/:branchId/residents')
export class ResidentController {
  constructor(@Inject(RESIDENT_SERVICE) private readonly service: ResidentService) {}
  @Get('account-link-requests')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'residentAccountLinkRequests',
    summary: 'RES-001 / ACC-004: pending active-resident account requests; stay_manage required',
  })
  @ApiResponse({ status: 200, schema: accountLinkPageDocumentation })
  linkRequests(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Query(zodPipe(z.object({ cursor: z.string().uuid().optional() }).strict())) query: unknown,
  ) {
    return this.service.linkRequests(actorOf(request), branchId, query);
  }
  @Put('account-link-requests/:requestId')
  @BranchScope('branchId')
  @CookieCsrf()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'decideResidentAccountLink',
    summary: 'RES-001 / ACC-004: approve or reject an active resident account link',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: { action: { type: 'string', enum: ['approve', 'reject'] } },
    },
  })
  @ApiResponse({
    status: 200,
    schema: { type: 'object', required: ['success'], properties: { success: { type: 'boolean' } } },
  })
  decideLink(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('requestId', id) requestId: string,
    @Body(zodPipe(residentAccountLinkDecisionSchema)) body: unknown,
  ) {
    return this.service.decideLink(actorOf(request), branchId, requestId, body);
  }
  @Get()
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ResidentDirectoryQueries()
  @ApiOperation({
    operationId: 'residentDirectory',
    summary: 'RES-004: one row per branch resident; requires live stay_manage permission',
  })
  @ApiResponse({ status: 200, schema: residentDirectoryDocumentation })
  directory(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Query(zodPipe(residentDirectoryQuerySchema)) query: unknown,
  ) {
    return this.service.directory(actorOf(request), branchId, query);
  }
  @Get(':residentId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'residentProfile',
    summary: 'RES-004 / CHG-009: staff-only profile; no identity documents or merged accounts',
  })
  @ApiResponse({ status: 200, schema: residentProfileDocumentation })
  profile(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('residentId', id) residentId: string,
    @Query(zodPipe(z.object({}).strict())) query: unknown,
  ) {
    return this.service.profile(actorOf(request), branchId, residentId, query);
  }
  @Put(':residentId/contact')
  @BranchScope('branchId')
  @CookieCsrf()
  @Header('Cache-Control', 'no-store')
  @ApiBody({ schema: residentContactUpdateDocumentation })
  @ApiOperation({
    operationId: 'updateResidentContact',
    summary: 'RES-006 / ACC-006: audited name and contact correction for an offline resident',
  })
  @ApiResponse({ status: 200, schema: residentContactDocumentation })
  @ApiResponse({ status: 409, description: 'CONFLICT: linked or archived resident.' })
  updateContact(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('residentId', id) residentId: string,
    @Body(zodPipe(residentContactUpdateSchema)) body: unknown,
  ) {
    return this.service.updateContact(actorOf(request), branchId, residentId, body);
  }
}

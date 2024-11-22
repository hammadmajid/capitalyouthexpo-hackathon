import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { stayIdentifierSchema, stayReadQuerySchema, customerStayQuerySchema } from '@hsm/contracts';
import { BranchScope, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { StayReadService } from './read.service.js';
import {
  StaffStayQueries,
  StayPageQueries,
  stayPageDocumentation,
  stayDetailDocumentation,
} from './read.documentation.js';
export const STAY_READ_SERVICE = Symbol('StayReadService');
const id = zodPipe(stayIdentifierSchema),
  empty = zodPipe(z.object({}).strict());
@ApiTags('Phase 3 private stays')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class StayReadController {
  constructor(@Inject(STAY_READ_SERVICE) private readonly service: StayReadService) {}
  @Get('branches/:branchId/stays')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @StaffStayQueries()
  @ApiOperation({
    operationId: 'staffStayPage',
    summary: 'RES-002 / ACC-004: private branch directory; requires live stay_manage permission',
  })
  @ApiResponse({ status: 200, schema: stayPageDocumentation })
  staffPage(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Query(zodPipe(stayReadQuerySchema)) query: unknown,
  ) {
    return this.service.staffPage(actorOf(request), branchId, query);
  }
  @Get('branches/:branchId/stays/:stayId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStayDetail',
    summary: 'RES-002 / ACC-004: exact scoped Stay without financial or identity-document contents',
  })
  @ApiResponse({ status: 200, schema: stayDetailDocumentation })
  staffDetail(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Query(empty) query: unknown,
  ) {
    return this.service.staffDetail(actorOf(request), branchId, stayId, query);
  }
  @Get('me/stays')
  @Self()
  @Header('Cache-Control', 'no-store')
  @StayPageQueries()
  @ApiOperation({
    operationId: 'customerStayPage',
    summary: 'RES-001 / SEC-003: only this authenticated account’s explicitly linked stays',
  })
  @ApiResponse({ status: 200, schema: stayPageDocumentation })
  customerPage(
    @Req() request: FastifyRequest,
    @Query(zodPipe(customerStayQuerySchema)) query: unknown,
  ) {
    return this.service.customerPage(actorOf(request), query);
  }
  @Get('me/stays/:stayId')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'customerStayDetail',
    summary: 'RES-001 / ACC-004: exact own Stay; another account’s identifier returns unavailable',
  })
  @ApiResponse({ status: 200, schema: stayDetailDocumentation })
  customerDetail(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Query(empty) query: unknown,
  ) {
    return this.service.customerDetail(actorOf(request), stayId, query);
  }
}

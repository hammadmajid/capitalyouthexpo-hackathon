import { contractObject } from '../services/http.js';
import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  bedOccupancyQuerySchema,
  bedHistoryQuerySchema,
  occupancyQuerySchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import type { OccupancyService } from './occupancy.service.js';
import {
  OccupancyQueries,
  bedOccupancyDocumentation,
  occupancyPageDocumentation,
} from './occupancy.documentation.js';
export const OCCUPANCY_SERVICE = Symbol('OccupancyService');
@ApiTags('Phase 5 occupancy')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('branches/:branchId/occupancy')
export class OccupancyController {
  constructor(@Inject(OCCUPANCY_SERVICE) private readonly service: OccupancyService) {}
  @Get()
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @OccupancyQueries()
  @ApiOperation({
    operationId: 'branchOccupancy',
    summary: 'BED-001 / RES-004: authoritative bed occupancy; requires live stay_manage permission',
  })
  @ApiResponse({ status: 200, schema: occupancyPageDocumentation })
  page(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(stayIdentifierSchema)) branchId: string,
    @Query(zodPipe(occupancyQuerySchema)) query: unknown,
  ) {
    return this.service.page(actorOf(request), branchId, query);
  }
  @Get('beds/:bedId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'on', required: false, schema: { type: 'string', format: 'date' } })
  @ApiOperation({
    operationId: 'bedOccupancy',
    summary: 'BED-002 / RES-004: one bed with its covering claims; requires stay_manage',
  })
  @ApiResponse({ status: 200, schema: bedOccupancyDocumentation })
  bed(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(stayIdentifierSchema)) branchId: string,
    @Param('bedId', zodPipe(stayIdentifierSchema)) bedId: string,
    @Query(zodPipe(bedOccupancyQuerySchema)) query: unknown,
  ) {
    return this.service.bed(actorOf(request), branchId, bedId, query);
  }
  @Get('beds/:bedId/history')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', maxLength: 80 } })
  @ApiOperation({
    operationId: 'bedOccupancyHistory',
    summary: 'BED-002 / RES-005: chronological bed assignments; requires stay_manage',
  })
  // eslint-disable-next-line no-secrets/no-secrets -- Public response schema identifier, not a credential.
  @ApiResponse({ status: 200, schema: contractObject('bedOccupancyHistoryPageSchema') })
  history(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(stayIdentifierSchema)) branchId: string,
    @Param('bedId', zodPipe(stayIdentifierSchema)) bedId: string,
    @Query(zodPipe(bedHistoryQuerySchema)) query: unknown,
  ) {
    return this.service.history(actorOf(request), branchId, bedId, query);
  }
}

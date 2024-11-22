import { cityDocumentation, areaDocumentation } from './geography.documentation.js';
import { areaPageInputSchema, type AreaPageInput } from '@hsm/contracts';
import {
  ManagementList,
  ManagementResponse,
  ManagerActionInput,
  ManagerRemovalInput,
  organizationDocumentation,
  branchDocumentation,
  managerDocumentation,
  transitionDocumentation,
} from './documentation.js';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags, ApiQuery } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  managementPageSchema,
  managerRemovalSchema,
  managerSuspensionSchema,
  type ManagementPage,
} from '@hsm/contracts';
import { Owner, Self, BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { ManagementService } from './service.js';
export const MANAGEMENT_SERVICE = Symbol('ManagementService');
const identifier = zodPipe(z.string().uuid());
const empty = z.object({}).strict();
@AuthProblems()
@ApiTags('Phase 1 management')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller()
export class ManagementController {
  constructor(@Inject(MANAGEMENT_SERVICE) private readonly service: ManagementService) {}
  @Owner()
  @Get('owner/geography/cities')
  @ManagementList(cityDocumentation)
  @ApiOperation({ summary: 'ONB-001: active city names for owned hostel setup' })
  cities(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Query(zodPipe(managementPageSchema)) query: ManagementPage,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.cities(actorOf(request), query);
  }
  @Owner()
  @Get('owner/geography/cities/:cityId/areas')
  @ManagementList(areaDocumentation)
  @ApiQuery({ name: 'parentId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiOperation({ summary: 'ONB-001: active areas or direct sub-areas in one active city' })
  areas(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('cityId', identifier) cityId: string,
    @Query(zodPipe(areaPageInputSchema)) query: AreaPageInput,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.areas(actorOf(request), cityId, query);
  }
  @Owner()
  @Get('owner/organizations')
  @ManagementList(organizationDocumentation)
  @ApiOperation({ summary: 'BRN-001: list owned live organizations' })
  organizations(
    @Req() request: FastifyRequest,
    @Query(zodPipe(managementPageSchema)) query: ManagementPage,
  ) {
    return this.service.organizations(actorOf(request), query);
  }
  @Owner()
  @Get('owner/branches')
  @ManagementList(branchDocumentation)
  @ApiOperation({ summary: 'BRN-002: list owned live branches' })
  ownedBranches(
    @Req() request: FastifyRequest,
    @Query(zodPipe(managementPageSchema)) query: ManagementPage,
  ) {
    return this.service.branches(actorOf(request), query, true);
  }
  @Self()
  @Get('manage/branches')
  @ManagementList(branchDocumentation)
  @ApiOperation({ summary: 'SEC-001: list branches accessible to this identity' })
  branches(
    @Req() request: FastifyRequest,
    @Query(zodPipe(managementPageSchema)) query: ManagementPage,
  ) {
    return this.service.branches(actorOf(request), query, false);
  }
  @BranchScope()
  @Get('manage/branches/:branchId')
  @ManagementResponse(branchDocumentation)
  @ApiOperation({ summary: 'SEC-001: scoped branch foundation lookup' })
  branch(@Req() request: FastifyRequest, @Param('branchId', identifier) branchId: string) {
    return this.service.branch(actorOf(request), branchId);
  }
  @BranchScope('branchId', true)
  @Get('manage/branches/:branchId/managers')
  @ManagementList(managerDocumentation)
  @ApiOperation({ summary: 'MGR-001: owner-only assignment history' })
  managers(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Query(zodPipe(managementPageSchema)) query: ManagementPage,
  ) {
    return this.service.managers(actorOf(request), branchId, query);
  }
  @BranchScope('branchId', true)
  @Post('manage/branches/:branchId/managers/:assignmentId/suspend')
  @HttpCode(200)
  @ManagementResponse(transitionDocumentation)
  @ApiOperation({ summary: 'MGR-004: suspend and immediately revoke manager sessions' })
  @ManagerActionInput(true)
  suspend(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('assignmentId', identifier) assignmentId: string,
    @Body(zodPipe(managerSuspensionSchema)) body: { reason: string },
  ) {
    return this.service.transition(
      actorOf(request),
      branchId,
      assignmentId,
      'suspend',
      body.reason,
    );
  }
  @BranchScope('branchId', true)
  @Post('manage/branches/:branchId/managers/:assignmentId/reinstate')
  @HttpCode(200)
  @ManagementResponse(transitionDocumentation)
  @ApiOperation({ summary: 'MGR-004: reinstate a suspended assignment' })
  @ManagerActionInput()
  reinstate(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('assignmentId', identifier) assignmentId: string,
    @Body() body: unknown,
  ) {
    empty.parse(body ?? {});
    return this.service.transition(actorOf(request), branchId, assignmentId, 'reinstate');
  }
  @BranchScope('branchId', true)
  @Post('manage/branches/:branchId/managers/:assignmentId/deactivate')
  @HttpCode(200)
  @ManagementResponse(transitionDocumentation)
  @ApiOperation({ summary: 'AUTH-M-006: end assignment, retain history and revoke sessions' })
  @ManagerRemovalInput()
  deactivate(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('assignmentId', identifier) assignmentId: string,
    @Body(zodPipe(managerRemovalSchema)) body: { currentPassword: string },
  ) {
    return this.service.remove(actorOf(request), branchId, assignmentId, body.currentPassword);
  }
}

import { Body, Controller, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { manualAdmissionCommandSchema, stayIdentifierSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { StayManualAdmissionService } from './manual-admission.service.js';
import { ManualAdmissionCommand } from './manual-admission.documentation.js';
export const STAY_MANUAL_ADMISSION_SERVICE = Symbol('manual admission');
const id = zodPipe(stayIdentifierSchema),
  emptySchema = z.object({}).strict(),
  empty = zodPipe(emptySchema);
@ApiTags('Phase 3 private Stay operations')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@BranchScope('branchId')
@AuthProblems()
@Controller('branches/:branchId/stays/manual')
export class StayManualAdmissionController {
  constructor(
    @Inject(STAY_MANUAL_ADMISSION_SERVICE) private readonly service: StayManualAdmissionService,
  ) {}
  @Post()
  @ManualAdmissionCommand()
  @ApiOperation({
    operationId: 'createManualStay',
    summary:
      'STAY-001 / RES-001 / RENT-003 / ACC-004: authorized atomic manual admission with original terms, occupancy and initial obligations',
  })
  async admit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Body(zodPipe(manualAdmissionCommandSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    emptySchema.parse(query);
    const result = await this.service.admit(
      actorOf(request),
      stayIdentifierSchema.parse(request.headers['idempotency-key']),
      branchId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

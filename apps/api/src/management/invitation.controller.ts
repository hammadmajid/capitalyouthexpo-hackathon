import { Body, Controller, HttpCode, Inject, Param, Post, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  managerInvitationInputSchema,
  managerCredentialInputSchema,
  type ManagerInvitationInput,
  type ManagerCredentialInput,
} from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { InvitationService } from './invitation.service.js';
import {
  invitationInputDocumentation,
  credentialDocumentation,
  invitationResponseDocumentation,
} from './invitation.documentation.js';
export const INVITATION_SERVICE = Symbol('InvitationService');
const identifier = z.string().uuid(),
  idPipe = zodPipe(identifier);
@BranchScope('branchId', true)
@AuthProblems()
@ApiTags('Owner manager invitations')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('manage/branches/:branchId/managers')
export class InvitationController {
  constructor(@Inject(INVITATION_SERVICE) private readonly service: InvitationService) {}
  @Post()
  @HttpCode(201)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: invitationInputDocumentation })
  @ApiResponse({ status: 201, schema: invitationResponseDocumentation })
  @ApiOperation({
    summary: 'AUTH-M-001: invite Manager; auto-generated temporary credential is disclosed once',
  })
  invite(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Body(zodPipe(managerInvitationInputSchema)) body: ManagerInvitationInput,
  ) {
    return this.respond(
      reply,
      this.service.invite(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Post(':assignmentId/reset-temp-password')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: credentialDocumentation })
  @ApiResponse({ status: 200, schema: invitationResponseDocumentation })
  @ApiOperation({
    summary:
      'AUTH-M-003: replace pending passwordless invitation credential without resetting a permanent account',
  })
  reset(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('assignmentId', idPipe) assignmentId: string,
    @Body(zodPipe(managerCredentialInputSchema)) body: ManagerCredentialInput,
  ) {
    return this.respond(
      reply,
      this.service.reset(actorOf(request), this.key(request), branchId, assignmentId, body),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<InvitationService['invite']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

import { Body, Controller, HttpCode, Inject, Put, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { ownerProfileInputSchema } from '@hsm/contracts';
import { Self } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from './problem.documentation.js';
import { AuthInput } from './request.documentation.js';
import { CookieCsrf, profileDocumentation } from './response.documentation.js';
import { ApiResponse } from '@nestjs/swagger';
import { SESSION_SERVICE, AUTH_TRANSPORT } from './http-session.js';
import { SessionService } from './session.service.js';
import { AuthTransport } from './transport.js';
import { OwnerProfileService } from './owner-profile.service.js';
export const OWNER_PROFILE_SERVICE = Symbol('OwnerProfileService');
@AuthProblems()
@ApiTags('Identity')
@Self()
@Controller('me/owner-profile')
export class OwnerProfileController {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
    @Inject(OWNER_PROFILE_SERVICE) private readonly owner: OwnerProfileService,
  ) {}
  @Put()
  @HttpCode(200)
  @AuthInput(ownerProfileInputSchema.innerType())
  @ApiResponse({ status: 200, schema: profileDocumentation })
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @CookieCsrf()
  @ApiOperation({
    summary:
      'AUTH-C CHG-006: complete the authenticated Owner profile with private verified evidence',
  })
  async complete(
    @Body(zodPipe(ownerProfileInputSchema)) body: z.infer<typeof ownerProfileInputSchema>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const actor = await this.sessions.authenticate(this.transport.token(request, 'access'));
    reply.header('Cache-Control', 'no-store');
    return this.owner.complete(actor, body);
  }
}

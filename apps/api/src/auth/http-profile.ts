import { AuthProblems } from './problem.documentation.js';
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags, ApiResponse, ApiSecurity } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { selfProfileSchema } from '@hsm/contracts';
import { Self } from '../access.js';
import { SESSION_SERVICE, AUTH_TRANSPORT } from './http-session.js';
import { SessionService } from './session.service.js';
import { AuthTransport } from './transport.js';
import { ProfileRepository } from './profile.repository.js';
import { profileDocumentation } from './response.documentation.js';
export const PROFILE_STORE = Symbol('ProfileStore');
@AuthProblems()
@ApiTags('Identity')
@Self()
@Controller('me')
export class ProfileController {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
    @Inject(PROFILE_STORE) private readonly profiles: Pick<ProfileRepository, 'read'>,
  ) {}
  @Get()
  @ApiResponse({ status: 200, schema: profileDocumentation })
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @ApiOperation({ summary: 'AUTH-C: current identity with masked CNIC and live capabilities' })
  async read(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    const actor = await this.sessions.authenticate(this.transport.token(request, 'access'));
    reply.header('Cache-Control', 'no-store');
    return selfProfileSchema.parse(await this.profiles.read(actor.userId));
  }
}

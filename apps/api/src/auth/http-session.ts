import { AuthProblems } from './problem.documentation.js';
import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiTags, ApiSecurity } from '@nestjs/swagger';
import { AuthInput } from './request.documentation.js';
import { AuthAck, AuthSession, CookieCsrf } from './response.documentation.js';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError, refreshRequestSchema, passwordChangeSchema } from '@hsm/contracts';
import { Public, Self } from '../access.js';
import { zodPipe } from '../problem.js';
import { SessionService } from './session.service.js';
import { AuthTransport } from './transport.js';
export const SESSION_SERVICE = Symbol('SessionService');
export const AUTH_TRANSPORT = Symbol('AuthTransport');
export const refreshSchema = refreshRequestSchema;
@AuthProblems()
@ApiTags('Authentication')
@Controller('auth')
export class SessionController {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
  ) {}
  @Public()
  @Post('refresh')
  @AuthInput(refreshRequestSchema)
  @AuthSession(false)
  @CookieCsrf()
  @HttpCode(200)
  async refresh(
    @Body(zodPipe(refreshSchema)) body: z.infer<typeof refreshSchema>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    // Mobile refresh uses the body; cookie credentials must never bypass CSRF via a body.
    const token = body.refreshToken;
    if (token && (request.headers.cookie || request.headers.authorization)) return this.ambiguous();
    const credentials = await this.sessions.refresh(
      token ?? this.transport.token(request, 'refresh'),
      token ? 'mobile' : 'web',
    );
    return this.transport.send(reply, credentials);
  }
  private ambiguous(): never {
    throw new DomainError('UNAUTHENTICATED', 401, 'Ambiguous authentication');
  }
  @Self()
  @Post('logout')
  @AuthAck('revoked')
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @CookieCsrf()
  @HttpCode(200)
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.revoke(request, reply, false);
  }
  @Self()
  @Post('logout-all')
  @AuthAck('revoked')
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @CookieCsrf()
  @HttpCode(200)
  async logoutAll(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    return this.revoke(request, reply, true);
  }
  @Self()
  @Post('password/change')
  @AuthInput(passwordChangeSchema)
  @AuthAck('changed')
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @CookieCsrf()
  @HttpCode(200)
  async changePassword(
    @Body(zodPipe(passwordChangeSchema)) body: z.infer<typeof passwordChangeSchema>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const actor = await this.sessions.authenticate(this.transport.token(request, 'access'));
    await this.sessions.changePassword(
      actor.userId,
      actor.sessionId,
      body.currentPassword,
      body.newPassword,
    );
    reply.header('Cache-Control', 'no-store');
    return { changed: true };
  }
  private async revoke(request: FastifyRequest, reply: FastifyReply, all: boolean) {
    const actor = await this.sessions.authenticate(this.transport.token(request, 'access'));
    await this.sessions.logout(actor.userId, actor.sessionId, all);
    this.transport.clear(reply);
    return { revoked: true };
  }
}

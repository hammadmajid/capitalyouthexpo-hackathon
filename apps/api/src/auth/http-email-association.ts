import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  emailAssociationRequestSchema,
  emailAssociationVerificationSchema,
  type EmailAssociationRequest,
  type EmailAssociationVerification,
} from '@hsm/contracts';
import { Self, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from './problem.documentation.js';
import { AuthInput } from './request.documentation.js';
import { AuthAck, CookieCsrf, profileDocumentation } from './response.documentation.js';
import { EmailAssociationService } from './email-association.service.js';
export const EMAIL_ASSOCIATION_SERVICE = Symbol('EmailAssociationService');
@AuthProblems()
@ApiTags('Identity')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Self()
@Controller('auth/email/associate')
export class EmailAssociationController {
  constructor(
    @Inject(EMAIL_ASSOCIATION_SERVICE) private readonly service: EmailAssociationService,
  ) {}
  @Post()
  @HttpCode(202)
  @AuthInput(emailAssociationRequestSchema)
  @AuthAck('accepted', 202)
  @CookieCsrf()
  @ApiOperation({
    summary:
      'AUTH-M CHG-006: reauthenticate phone-only Manager and request email association proof',
  })
  async request(
    @Body(zodPipe(emailAssociationRequestSchema)) body: EmailAssociationRequest,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.request(actorOf(request), body);
  }
  @Post('verify')
  @HttpCode(200)
  @AuthInput(emailAssociationVerificationSchema)
  @ApiResponse({ status: 200, schema: profileDocumentation })
  @CookieCsrf()
  @ApiOperation({
    summary:
      'AUTH-M SEC-001: consume own email association proof without replacing identity or credentials',
  })
  async verify(
    @Body(zodPipe(emailAssociationVerificationSchema)) body: EmailAssociationVerification,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.verify(actorOf(request), body);
  }
}

import { AuthProblems } from './problem.documentation.js';
import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import {
  emailRequestSchema,
  emailVerificationSessionSchema,
  loginSchema,
  passwordResetSchema,
  registrationSchema,
} from '@hsm/contracts';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { AUTH_TRANSPORT } from './http-session.js';
import { AuthTransport } from './transport.js';
import { IdentityService } from './identity.service.js';
import { OtpService } from './otp.service.js';
import { AuthInput } from './request.documentation.js';
import { AuthAck, AuthSession } from './response.documentation.js';
export const IDENTITY_SERVICE = Symbol('IdentityService');
export const OTP_SERVICE = Symbol('OtpService');
@AuthProblems()
@ApiTags('Authentication')
@Public()
@Controller('auth')
export class IdentityController {
  constructor(
    @Inject(IDENTITY_SERVICE) private readonly identity: IdentityService,
    @Inject(OTP_SERVICE) private readonly otp: OtpService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
  ) {}
  @Post('register')
  @AuthInput(registrationSchema)
  @AuthAck('verificationRequired', 202)
  @HttpCode(202)
  @ApiOperation({ summary: 'AUTH-C-001: register and queue email verification' })
  register(@Body(zodPipe(registrationSchema)) body: z.infer<typeof registrationSchema>) {
    return this.identity.register(body);
  }
  @Post('login')
  @AuthInput(loginSchema)
  @AuthSession()
  @HttpCode(200)
  @ApiOperation({ summary: 'AUTH-M-005: authenticate an existing identity' })
  async login(
    @Body(zodPipe(loginSchema)) body: z.infer<typeof loginSchema>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.transport.send(reply, await this.identity.login(body));
  }
  @Post('email/verify')
  @AuthInput(emailVerificationSessionSchema)
  @AuthSession()
  @HttpCode(200)
  @ApiOperation({ summary: 'AUTH-C-002: consume email OTP and create a session' })
  async verify(
    @Body(zodPipe(emailVerificationSessionSchema))
    body: z.infer<typeof emailVerificationSessionSchema>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.transport.send(
      reply,
      await this.identity.verifyEmail(body.email, body.code, body.client),
    );
  }
  @Post('email/resend')
  @AuthInput(emailRequestSchema)
  @AuthAck('verificationRequired', 202)
  @HttpCode(202)
  @ApiOperation({ summary: 'AUTH-C-002: queue verification subject to resend cooldown' })
  async resend(@Body(zodPipe(emailRequestSchema)) body: z.infer<typeof emailRequestSchema>) {
    await this.otp.request(body.email, 'signup_verify');
    return { verificationRequired: true };
  }
  @Post('password/forgot')
  @AuthInput(emailRequestSchema)
  @AuthAck('accepted', 202)
  @HttpCode(202)
  @ApiOperation({ summary: 'SEC: acknowledge password recovery without account enumeration' })
  async forgot(@Body(zodPipe(emailRequestSchema)) body: z.infer<typeof emailRequestSchema>) {
    await this.otp.request(body.email, 'password_reset');
    return { accepted: true };
  }
  @Post('password/reset')
  @AuthInput(passwordResetSchema)
  @AuthAck('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'SEC: consume reset OTP and revoke all sessions atomically' })
  reset(@Body(zodPipe(passwordResetSchema)) body: z.infer<typeof passwordResetSchema>) {
    return this.identity.resetPassword(body.email, body.code, body.newPassword);
  }
}

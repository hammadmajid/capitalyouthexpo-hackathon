import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import {
  registrationStartSchema,
  registrationVerifySchema,
  registrationPasswordSchema,
} from '@hsm/contracts';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from './problem.documentation.js';
import { AuthInput } from './request.documentation.js';
import { AuthAck, AuthSession } from './response.documentation.js';
import { AUTH_TRANSPORT } from './http-session.js';
import { AuthTransport } from './transport.js';
import { RegistrationService } from './registration.service.js';
export const REGISTRATION_SERVICE = Symbol('RegistrationService');
@AuthProblems()
@ApiTags('Authentication')
@Public()
@Controller('auth/registration')
export class RegistrationController {
  constructor(
    @Inject(REGISTRATION_SERVICE) private readonly registration: RegistrationService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
  ) {}
  @Post('start')
  @HttpCode(202)
  @AuthInput(registrationStartSchema)
  @AuthAck('verificationRequired', 202)
  @ApiOperation({
    summary: 'AUTH-C-001: begin email-first registration without a password or session',
  })
  async start(
    @Body(zodPipe(registrationStartSchema)) body: z.infer<typeof registrationStartSchema>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.registration.start(body);
  }
  @Post('verify')
  @HttpCode(200)
  @AuthInput(registrationVerifySchema)
  @ApiOperation({ summary: 'AUTH-C-002: consume email proof for password setup only' })
  @ApiResponse({
    status: 200,
    schema: {
      oneOf: [
        {
          type: 'object',
          additionalProperties: false,
          required: ['next', 'setupToken', 'expiresIn'],
          properties: {
            next: { type: 'string', enum: ['password'] },
            setupToken: {
              type: 'string',
              pattern: '^[A-Za-z0-9_-]{43}$',
              description: 'One-use password continuation; never an access credential',
            },
            expiresIn: { type: 'integer', enum: [600] },
          },
        },
        {
          type: 'object',
          additionalProperties: false,
          required: ['next'],
          properties: { next: { type: 'string', enum: ['login'] } },
        },
      ],
    },
  })
  async verify(
    @Body(zodPipe(registrationVerifySchema)) body: z.infer<typeof registrationVerifySchema>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.registration.verify(body);
  }
  @Post('password')
  @HttpCode(200)
  @AuthInput(registrationPasswordSchema)
  @AuthSession()
  @ApiOperation({
    summary: 'AUTH-C-001/002: consume setup grant and establish the first normal session',
  })
  async password(
    @Body(zodPipe(registrationPasswordSchema)) body: z.infer<typeof registrationPasswordSchema>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.transport.send(reply, await this.registration.password(body));
  }
}

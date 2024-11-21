import { AuthProblems } from './problem.documentation.js';
import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { managerActivationSchema } from '@hsm/contracts';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { AUTH_TRANSPORT } from './http-session.js';
import { AuthTransport } from './transport.js';
import { ManagerService } from './manager.service.js';
import { AuthInput } from './request.documentation.js';
import { AuthSession } from './response.documentation.js';
export const MANAGER_SERVICE = Symbol('ManagerService');
@AuthProblems()
@ApiTags('Authentication')
@Public()
@Controller('auth/manager')
export class ManagerController {
  constructor(
    @Inject(MANAGER_SERVICE) private readonly managers: ManagerService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
  ) {}
  @Post('activate')
  @AuthInput(managerActivationSchema)
  @AuthSession()
  @HttpCode(200)
  @ApiOperation({ summary: 'AUTH-M-003/004: consume invitation and set permanent password' })
  async activate(
    @Body(zodPipe(managerActivationSchema)) body: z.infer<typeof managerActivationSchema>,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.transport.send(reply, await this.managers.activate(body));
  }
}

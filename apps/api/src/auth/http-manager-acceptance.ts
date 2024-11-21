import { Body, Controller, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Self, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from './problem.documentation.js';
import { AuthInput } from './request.documentation.js';
import { CookieCsrf, profileDocumentation } from './response.documentation.js';
import { ManagerAcceptanceService } from './manager-acceptance.service.js';
export const MANAGER_ACCEPTANCE_SERVICE = Symbol('ManagerAcceptanceService');
const empty = z.object({}).strict();
@AuthProblems()
@ApiTags('Identity')
@Self()
@Controller('me/manager-invitations')
export class ManagerAcceptanceController {
  constructor(
    @Inject(MANAGER_ACCEPTANCE_SERVICE) private readonly service: ManagerAcceptanceService,
  ) {}
  @Post('accept')
  @HttpCode(200)
  @AuthInput(empty)
  @ApiResponse({ status: 200, schema: profileDocumentation })
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @CookieCsrf()
  @ApiOperation({
    summary: 'AUTH-M CHG-006: accept own pending invitation using permanent authentication',
  })
  async accept(
    @Body(zodPipe(empty)) _body: z.infer<typeof empty>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.accept(actorOf(request));
  }
}

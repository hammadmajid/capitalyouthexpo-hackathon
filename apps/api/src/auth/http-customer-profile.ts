import { Body, Controller, HttpCode, Inject, Put, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { customerProfileInputSchema } from '@hsm/contracts';
import { Self } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from './problem.documentation.js';
import { AuthInput } from './request.documentation.js';
import { CookieCsrf, profileDocumentation } from './response.documentation.js';
import { ApiResponse } from '@nestjs/swagger';
import { SESSION_SERVICE, AUTH_TRANSPORT } from './http-session.js';
import { SessionService } from './session.service.js';
import { AuthTransport } from './transport.js';
import { CustomerProfileService } from './customer-profile.service.js';
export const CUSTOMER_PROFILE_SERVICE = Symbol('CustomerProfileService');
@AuthProblems()
@ApiTags('Identity')
@Self()
@Controller('me/customer-profile')
export class CustomerProfileController {
  constructor(
    @Inject(SESSION_SERVICE) private readonly sessions: SessionService,
    @Inject(AUTH_TRANSPORT) private readonly transport: AuthTransport,
    @Inject(CUSTOMER_PROFILE_SERVICE) private readonly customer: CustomerProfileService,
  ) {}
  @Put()
  @HttpCode(200)
  @AuthInput(customerProfileInputSchema)
  @ApiResponse({ status: 200, schema: profileDocumentation })
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @CookieCsrf()
  @ApiOperation({
    summary:
      'AUTH-C CHG-006: complete or update the authenticated Customer profile without initial CNIC',
  })
  async complete(
    @Body(zodPipe(customerProfileInputSchema)) body: z.infer<typeof customerProfileInputSchema>,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const actor = await this.sessions.authenticate(this.transport.token(request, 'access'));
    reply.header('Cache-Control', 'no-store');
    return this.customer.complete(actor, body);
  }
}

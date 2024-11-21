import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Self, actorOf } from '../access.js';
import { AuthProblems } from './problem.documentation.js';
import { ProfileDetailsService } from './profile-details.service.js';
import { profileDetailsDocumentation } from './profile-details.documentation.js';
export const PROFILE_DETAILS_SERVICE = Symbol('ProfileDetailsService');
@AuthProblems()
@ApiTags('Identity')
@Self()
@Controller('me/profile-details')
export class ProfileDetailsController {
  constructor(@Inject(PROFILE_DETAILS_SERVICE) private readonly profiles: ProfileDetailsService) {}
  @Get()
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @ApiResponse({ status: 200, schema: profileDetailsDocumentation })
  @ApiOperation({
    summary: 'AUTH-C CHG-006: read self-only Customer and Owner edit details with masked CNIC',
  })
  read(@Req() request: FastifyRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return this.profiles.read(actorOf(request));
  }
}

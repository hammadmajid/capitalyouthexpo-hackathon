import { Controller, Get, Header, Inject, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { RESIDENT_SERVICE } from './residents.controller.js';
import type { ResidentService } from './residents.service.js';
@ApiTags('Phase 5 residents')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('me/resident-link-status')
export class OwnAccountLinkController {
  constructor(@Inject(RESIDENT_SERVICE) private readonly service: ResidentService) {}
  @Get()
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownResidentAccountLinkStatus',
    summary: 'RES-001: own pending hostel confirmation without resident disclosure',
  })
  @ApiResponse({
    status: 200,
    schema: { type: 'object', required: ['pending'], properties: { pending: { type: 'boolean' } } },
  })
  read(@Req() request: FastifyRequest) {
    return this.service.ownLinkStatus(actorOf(request));
  }
}

import { Controller, Get, Header, Inject, Param, Query, Req } from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Admin, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { contractObject, idPipe } from '../services/http.js';
import { identifier } from '../inventory/documentation.js';
import { PLATFORM_ADMIN, type PlatformAdmin } from './admin.controller.js';

@ApiTags('Platform support message continuation')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class SupportPagesController {
  constructor(@Inject(PLATFORM_ADMIN) private readonly admin: PlatformAdmin) {}
  @Get('admin/support-tickets/:ticketId/messages')
  @Admin(['support'])
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'ticketId', required: true, schema: identifier })
  @ApiOperation({
    operationId: 'adminSupportMessages',
    summary: 'ADM-009: staff-only complete ticket thread continuation',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiResponse({ status: 200, schema: contractObject('supportMessagePageSchema') })
  staff(
    @Req() request: FastifyRequest,
    @Param('ticketId', idPipe) ticketId: string,
    @Query() query: unknown,
  ) {
    return this.admin.support.staffMessages(actorOf(request), ticketId, query);
  }
  @Get('support/tickets/:ticketId/messages')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'ticketId', required: true, schema: identifier })
  @ApiOperation({
    operationId: 'ownSupportMessages',
    summary: 'ADM-009 SEC-003: participant-only public messages, without staff notes',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiResponse({ status: 200, schema: contractObject('supportMessagePageSchema') })
  own(
    @Req() request: FastifyRequest,
    @Param('ticketId', idPipe) ticketId: string,
    @Query() query: unknown,
  ) {
    return this.admin.support.ownMessages(actorOf(request), ticketId, query);
  }
}

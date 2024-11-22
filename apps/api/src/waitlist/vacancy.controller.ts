import { Body, Controller, Get, Header, Inject, Param, Put, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { saveExpectedVacancySchema } from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
import { WAITLIST_SERVICE } from './controller.js';
import { WaitlistService } from './service.js';
const id = z.string().uuid(),
  pipe = zodPipe(id);
const date = nullable({ type: 'string', format: 'date' }),
  version = nullable({ type: 'string', format: 'date-time' });
const result = object({
  branchId: identifier,
  roomTypeId: identifier,
  expectedVacancyDate: date,
  version,
});
@ApiTags('Waiting list')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('branches/:branchId/room-types/:roomTypeId/expected-vacancy')
export class WaitlistVacancyController {
  constructor(@Inject(WAITLIST_SERVICE) private readonly service: WaitlistService) {}
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get()
  @ApiOperation({
    operationId: 'readExpectedVacancy',
    summary: 'WAIT-001: exact current room-type estimate and version',
  })
  @ApiResponse({ status: 200, schema: result })
  read(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
  ) {
    return this.service.vacancy(actorOf(request), branchId, roomTypeId);
  }
  @BranchScope()
  @CookieCsrf()
  @Put()
  @ApiOperation({
    operationId: 'saveExpectedVacancy',
    summary: 'WAIT-001 / ACC-006: audited listing_edit estimate for a currently full room type',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier })
  @ApiBody({ schema: object({ expectedVersion: version, expectedVacancyDate: date }) })
  @ApiResponse({ status: 200, schema: result })
  async save(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('roomTypeId', pipe) roomTypeId: string,
    @Body(zodPipe(saveExpectedVacancySchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const response = await this.service.saveVacancy(
      actorOf(request),
      id.parse(request.headers['idempotency-key']),
      branchId,
      roomTypeId,
      body,
    );
    reply
      .code(response.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(response.replayed));
    return response.body;
  }
}

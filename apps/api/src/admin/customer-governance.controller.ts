import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject, idPipe, idempotencyHeader, replay } from '../services/http.js';
import type { CustomerGovernanceService } from './customer-governance.service.js';
export const CUSTOMER_GOVERNANCE = Symbol('CustomerGovernance');
@ApiTags('Customer enforcement')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('admin/customers')
export class CustomerGovernanceController {
  constructor(@Inject(CUSTOMER_GOVERNANCE) private readonly service: CustomerGovernanceService) {}
  @Get()
  @Admin(['content_moderator'])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminCustomerList',
    summary: 'HMA-015: bounded eligible customer accounts; no contact or identity documents',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiQuery({ name: 'userId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'suspended', 'banned'] })
  @ApiResponse({ status: 200, schema: contractObject('customerGovernancePageSchema') })
  list(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.list(actorOf(request), query);
  }
  @Post(':userId/decisions')
  @Admin(['content_moderator'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'adminCustomerDecision',
    summary:
      'HMA-015: reasoned, version-checked customer enforcement with session revocation and audit',
  })
  @ApiParam({ name: 'userId', schema: { type: 'string', format: 'uuid' } })
  @ApiBody({ schema: contractObject('customerGovernanceInputSchema') })
  @ApiResponse({ status: 200, schema: contractObject('customerGovernanceRecordSchema') })
  async decide(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('userId', idPipe) id: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.service.decide(actorOf(request), request.headers['idempotency-key'], id, body),
    );
  }
}

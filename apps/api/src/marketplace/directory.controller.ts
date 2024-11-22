import { Body, Controller, HttpCode, Inject, Param, Post, Put, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { institutionGovernanceInputSchema, institutionUpdateInputSchema } from '@hsm/contracts';
import { Admin, actorOf } from '../access.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import { object, identifier, nullable } from '../inventory/documentation.js';
import { InstitutionService } from './directory.service.js';
export const INSTITUTION_SERVICE = Symbol('InstitutionService');
const input = object({
  changeReason: { type: 'string', minLength: 8, maxLength: 500 },
  reapprove: { type: 'boolean', default: false },
  name: { type: 'string', minLength: 2, maxLength: 180 },
  shortName: nullable({ type: 'string', minLength: 1, maxLength: 40 }),
  cityId: identifier,
  areaId: nullable(identifier),
  address: nullable({ type: 'string', minLength: 1, maxLength: 300 }),
  latitude: { type: 'number', minimum: -90, maximum: 90 },
  longitude: { type: 'number', minimum: -180, maximum: 180 },
  aliases: {
    type: 'array',
    maxItems: 20,
    uniqueItems: true,
    items: { type: 'string', minLength: 1, maxLength: 120 },
  },
  isActive: { type: 'boolean' },
  publicApproved: { type: 'boolean' },
});
const updateInput = {
  ...input,
  properties: {
    ...input.properties,
    expectedRevision: {
      type: 'string' as const,
      pattern: '^[0-9]{1,19}$',
      description: 'Revision from the latest institution detail response',
    },
  },
  required: [...(input.required ?? []), 'expectedRevision'],
};
const output = object({
  id: identifier,
  isActive: { type: 'boolean' },
  publicApproved: { type: 'boolean' },
});
@Admin(['verification'], true)
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 2 approved institution directory')
@Controller('admin/institutions')
export class InstitutionController {
  constructor(@Inject(INSTITUTION_SERVICE) private readonly service: InstitutionService) {}
  @Post()
  @HttpCode(201)
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: input })
  @ApiResponse({ status: 201, schema: output })
  @ApiOperation({
    summary: 'ACC-002: Root creates a directory identity with explicit accurate-data approval',
  })
  create(
    @Req() request: FastifyRequest,
    @Body(zodPipe(institutionGovernanceInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.service.save(actorOf(request), this.key(request), body));
  }
  @Put(':placeId')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: updateInput })
  @ApiResponse({ status: 200, schema: output })
  @ApiOperation({
    summary:
      'ACC-002: Root updates or withdraws institution approval without replacing its identity',
  })
  update(
    @Req() request: FastifyRequest,
    @Param('placeId', zodPipe(z.string().uuid())) placeId: string,
    @Body(zodPipe(institutionUpdateInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.save(actorOf(request), this.key(request), body, placeId),
    );
  }
  private key(request: FastifyRequest) {
    return z.string().uuid().parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<InstitutionService['save']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

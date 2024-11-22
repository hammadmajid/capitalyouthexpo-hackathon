import { Body, Controller, Get, Inject, Param, Put, Query, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { favoriteInputSchema, managementPageSchema } from '@hsm/contracts';
import { z } from 'zod';
import { Customer, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, identifier } from '../inventory/documentation.js';
import { pageDocumentation } from './documentation.js';
import { FavoritesService } from './favorites.service.js';
export const FAVORITES_SERVICE = Symbol('FavoritesService');
@Customer()
@AuthProblems()
@ApiTags('Phase 2 Saved')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('me/favorites')
export class FavoritesController {
  constructor(@Inject(FAVORITES_SERVICE) private readonly service: FavoritesService) {}
  @Get()
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 20 },
  })
  @ApiResponse({ status: 200, schema: pageDocumentation })
  @ApiOperation({
    summary: 'ACC-002: list own Saved approved hostels; never leak unavailable private listings',
  })
  list(@Req() request: FastifyRequest, @Query(zodPipe(managementPageSchema)) page: unknown) {
    return this.service.list(actorOf(request), page);
  }
  @Put(':branchId')
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: object({ saved: { type: 'boolean' } }) })
  @ApiResponse({
    status: 200,
    schema: object({ branchId: identifier, saved: { type: 'boolean' } }),
  })
  @ApiOperation({ summary: 'ACC-002: save/remove a preference for this Customer only' })
  async save(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Body(zodPipe(favoriteInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.save(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

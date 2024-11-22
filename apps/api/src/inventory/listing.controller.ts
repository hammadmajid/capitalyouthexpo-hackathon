import { contractObject } from '../services/http.js';
import { customAmenityCommandSchema } from '@hsm/contracts';
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { amenityCatalogQuerySchema, listingSettingsInputSchema } from '@hsm/contracts';
import { actorOf, BranchScope, Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems, problemDocumentation } from '../auth/problem.documentation.js';
import { ListingService } from './listing.service.js';
import {
  amenityCatalogDocumentation,
  listingInputDocumentation,
  listingReadDocumentation,
} from './listing.documentation.js';
export const LISTING_SERVICE = Symbol('ListingService');
@BranchScope('branchId')
@AuthProblems()
@ApiTags('Phase 2 listing settings')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/listing')
export class ListingController {
  constructor(@Inject(LISTING_SERVICE) private readonly service: ListingService) {}
  @Get('custom-amenities')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'customAmenityCatalog',
    summary: 'LIST-001: organization-scoped custom amenities',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string' } })
  @ApiResponse({ status: 200, schema: contractObject('customAmenityPageSchema') })
  custom(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Query(zodPipe(amenityCatalogQuerySchema)) query: unknown,
  ) {
    return this.service.customCatalog(actorOf(request), branchId, query);
  }
  @Post('custom-amenities')
  @CookieCsrf()
  @ApiOperation({
    operationId: 'saveCustomAmenity',
    summary: 'LIST-001: owner-defined amenity create, edit or archive',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: contractObject('customAmenityCommandSchema') })
  @ApiResponse({ status: 200, schema: contractObject('customAmenitySchema') })
  async customWrite(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Body(zodPipe(customAmenityCommandSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.saveCustom(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
  @Get()
  @ApiOperation({
    operationId: 'readListing',
    summary: 'ACC-002 / ACC-004: current private branch listing settings and edit permission',
  })
  @ApiResponse({
    status: 200,
    schema: listingReadDocumentation,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  async read(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Query(zodPipe(z.object({}).strict())) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.read(actorOf(request), branchId, query);
    reply.header('Cache-Control', 'no-store').header('ETag', '"' + result.version + '"');
    return result;
  }
  @Put()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiHeader({
    name: 'If-Match',
    required: true,
    schema: { type: 'string', pattern: '^"[a-f0-9]{64}"$' },
  })
  @ApiBody({ schema: listingInputDocumentation })
  @ApiResponse({
    status: 200,
    schema: listingReadDocumentation,
    headers: { ETag: { schema: { type: 'string' } } },
  })
  @ApiResponse({
    status: 412,
    description: 'PRECONDITION_FAILED: refresh changed settings.',
    content: { 'application/problem+json': { schema: problemDocumentation } },
  })
  @ApiOperation({
    operationId: 'saveListing',
    summary:
      'TRUST-006 / ACC-004: audit explicit minor listing edits and approved amenities under listing_edit',
  })
  async save(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Body(zodPipe(listingSettingsInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.save(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      request.headers['if-match'],
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store')
      .header('ETag', '"' + result.body.version + '"');
    return result.body;
  }
}
@Public()
@AuthProblems()
@ApiTags('Phase 2 public marketplace')
@Controller('marketplace/amenities')
export class AmenityCatalogController {
  constructor(@Inject(LISTING_SERVICE) private readonly service: ListingService) {}
  @Get()
  @ApiOperation({
    operationId: 'listAmenities',
    summary:
      'ACC-002: bounded active platform-approved amenity catalog without private branch scope',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: { type: 'string', pattern: '^[a-z][a-z0-9_]{1,47}$' },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiResponse({ status: 200, schema: amenityCatalogDocumentation })
  list(
    @Query(zodPipe(amenityCatalogQuerySchema)) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.catalog(query);
  }
}

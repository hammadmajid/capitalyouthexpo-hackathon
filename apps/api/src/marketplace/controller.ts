import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { MarketplaceService } from './service.js';
import {
  searchPageDocumentation,
  overviewDocumentation,
  institutionsDocumentation,
} from './documentation.js';
export const MARKETPLACE_SERVICE = Symbol('MarketplaceService');
const idPipe = zodPipe(z.string().uuid());
@Public()
@ApiTags('Phase 2 public marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(@Inject(MARKETPLACE_SERVICE) private readonly service: MarketplaceService) {}
  @Get()
  @ApiOperation({
    summary:
      'ACC-002: search only approved listings without occupant identities or private documents',
  })
  @ApiResponse({ status: 200, schema: searchPageDocumentation })
  @ApiQuery({
    name: 'ids',
    required: false,
    schema: {
      type: 'string',
      description: 'Comma-separated branch UUIDs, maximum 20, for recently viewed listings',
    },
  })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: { type: 'string', maxLength: 160, description: 'UUID or sort continuation' },
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    schema: {
      type: 'string',
      enum: ['recommended', 'nearest', 'price_asc', 'price_desc', 'most_available'],
    },
  })
  @ApiQuery({
    name: 'maximumDepositPaisa',
    required: false,
    schema: { type: 'integer', minimum: 0 },
  })
  @ApiQuery({
    name: 'capacity',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 64 },
  })
  @ApiQuery({
    name: 'optionKind',
    required: false,
    schema: { type: 'string', enum: ['bed', 'room'] },
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({ name: 'cityId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'areaId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'universityPlaceId',
    required: false,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiQuery({
    name: 'nearLatitude',
    required: false,
    schema: { type: 'number', minimum: -90, maximum: 90 },
  })
  @ApiQuery({
    name: 'nearLongitude',
    required: false,
    schema: { type: 'number', minimum: -180, maximum: 180 },
  })
  @ApiQuery({
    name: 'radiusMeters',
    required: false,
    schema: { type: 'integer', minimum: 100, maximum: 200000 },
  })
  @ApiQuery({
    name: 'category',
    required: false,
    schema: { type: 'string', enum: ['boys', 'girls', 'working_male', 'working_female'] },
  })
  @ApiQuery({ name: 'minimumRentPaisa', required: false, schema: { type: 'integer', minimum: 0 } })
  @ApiQuery({ name: 'maximumRentPaisa', required: false, schema: { type: 'integer', minimum: 0 } })
  @ApiQuery({ name: 'moveInDate', required: false, schema: { type: 'string', format: 'date' } })
  @ApiQuery({ name: 'moveOutDate', required: false, schema: { type: 'string', format: 'date' } })
  @ApiQuery({
    name: 'availableOnly',
    required: false,
    schema: { type: 'string', enum: ['true', 'false'] },
  })
  @ApiQuery({
    name: 'amenities',
    required: false,
    schema: { type: 'string', description: 'Comma-separated approved amenity codes' },
  })
  @ApiQuery({
    name: 'west',
    required: false,
    schema: { type: 'number', minimum: -180, maximum: 180 },
  })
  @ApiQuery({
    name: 'east',
    required: false,
    schema: { type: 'number', minimum: -180, maximum: 180 },
  })
  @ApiQuery({
    name: 'south',
    required: false,
    schema: { type: 'number', minimum: -90, maximum: 90 },
  })
  @ApiQuery({
    name: 'north',
    required: false,
    schema: { type: 'number', minimum: -90, maximum: 90 },
  })
  list(@Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return this.service.list(query);
  }
  @Get('institutions')
  @ApiOperation({ summary: 'ACC-002: active university directory with real PostGIS hostel counts' })
  @ApiResponse({ status: 200, schema: institutionsDocumentation })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 120 } })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100 },
  })
  @ApiQuery({
    name: 'radiusMeters',
    required: false,
    schema: { type: 'integer', minimum: 100, maximum: 200000 },
  })
  institutions(@Query() query: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    reply.header('Cache-Control', 'no-store');
    return this.service.institutions(query);
  }
  @Get('media/:mediaId')
  @ApiOperation({
    summary:
      'ACC-002 SEC-003: serve only an explicitly published clean image; no private URL is returned',
  })
  @ApiProduces('image/jpeg', 'image/png', 'image/webp')
  @ApiResponse({ status: 200, schema: { type: 'string', format: 'binary' } })
  async image(@Param('mediaId', idPipe) mediaId: string, @Res() reply: FastifyReply) {
    const result = await this.service.image(mediaId);
    return reply
      .header('Cache-Control', 'no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .type(result.mimeType)
      .send(result.bytes);
  }
  @Get(':branchId')
  @ApiOperation({
    summary:
      'ACC-002: approved hostel details, public prices and date-specific aggregate availability',
  })
  @ApiResponse({ status: 200, schema: overviewDocumentation })
  @ApiQuery({ name: 'moveInDate', required: false, schema: { type: 'string', format: 'date' } })
  @ApiQuery({ name: 'moveOutDate', required: false, schema: { type: 'string', format: 'date' } })
  details(
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.details(branchId, query);
  }
}

import { Controller, Get, Inject, Param, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { PublicGalleryService } from './gallery.service.js';
export const PUBLIC_GALLERY_SERVICE = Symbol('PublicGalleryService');
@Public()
@ApiTags('Phase 2 public marketplace')
@Controller('marketplace/:branchId/gallery')
export class PublicGalleryController {
  constructor(@Inject(PUBLIC_GALLERY_SERVICE) private readonly service: PublicGalleryService) {}
  @Get()
  @ApiOperation({
    summary:
      'ACC-002: bounded currently approved published gallery; no private file credentials or identities',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    schema: {
      type: 'string',
      maxLength: 47,
      description: 'Canonical last returned image order and UUID position',
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['branchId', 'data', 'nextCursor'],
      properties: {
        branchId: { type: 'string', format: 'uuid' },
        data: {
          type: 'array',
          maxItems: 100,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'altText'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              altText: { type: 'string', minLength: 1, maxLength: 240 },
            },
          },
        },
        nextCursor: { type: 'string', maxLength: 47, nullable: true },
      },
    },
  })
  read(
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(branchId, query);
  }
}

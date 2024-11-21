import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  galleryArchiveSchema,
  galleryAttachSchema,
  galleryEditSchema,
  galleryQuerySchema,
} from '@hsm/contracts';
import { actorOf, BranchScope } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { GalleryService } from './gallery.service.js';
import {
  GalleryCommand,
  galleryArchiveDocumentation,
  galleryAttachDocumentation,
  galleryEditDocumentation,
  galleryPageDocumentation,
} from './gallery.documentation.js';
import { object } from './documentation.js';
export const GALLERY_SERVICE = Symbol('GalleryService');
const identifier = z.string().uuid(),
  pipe = zodPipe(identifier);
@BranchScope('branchId')
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Phase 2 listing gallery')
@Controller('branches/:branchId/gallery')
export class GalleryController {
  constructor(@Inject(GALLERY_SERVICE) private readonly service: GalleryService) {}
  @Get()
  @ApiOperation({
    operationId: 'readGallery',
    summary: 'ROOM-003 / ACC-004: bounded private listing gallery metadata',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  })
  @ApiQuery({
    name: 'state',
    required: false,
    schema: { type: 'string', enum: ['active', 'archived', 'all'], default: 'active' },
  })
  @ApiQuery({ name: 'roomId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({ name: 'bedId', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiResponse({ status: 200, schema: galleryPageDocumentation })
  read(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Query(zodPipe(galleryQuerySchema)) query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), branchId, query);
  }
  @Post()
  @GalleryCommand(galleryAttachDocumentation, 201, false)
  @ApiOperation({
    operationId: 'attachGalleryImage',
    summary: 'ROOM-003: attach an uploader-owned clean private listing photo without publishing',
  })
  attach(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(galleryAttachSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.attach(actorOf(request), this.key(request), branchId, body),
    );
  }
  @Put(':mediaId')
  @GalleryCommand(galleryEditDocumentation)
  @ApiOperation({
    operationId: 'editGalleryImage',
    summary: 'ROOM-003 / SEC-003: explicitly enable or disable image publication and edit metadata',
  })
  edit(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('mediaId', pipe) mediaId: string,
    @Body(zodPipe(galleryEditSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.edit(
        actorOf(request),
        this.key(request),
        branchId,
        mediaId,
        request.headers['if-match'],
        body,
      ),
    );
  }
  @Post(':mediaId/archive')
  @GalleryCommand(galleryArchiveDocumentation)
  @ApiOperation({
    operationId: 'archiveGalleryImage',
    summary: 'AUD-001 / ROOM-003: retain an archived gallery record with an audited reason',
  })
  archive(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('mediaId', pipe) mediaId: string,
    @Body(zodPipe(galleryArchiveSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.archive(
        actorOf(request),
        this.key(request),
        branchId,
        mediaId,
        request.headers['if-match'],
        body,
      ),
    );
  }
  @Post(':mediaId/cover')
  @GalleryCommand(object({}))
  @ApiOperation({
    operationId: 'selectGalleryCover',
    summary: 'ROOM-003: promote an image to first order without implicitly publishing it',
  })
  cover(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('mediaId', pipe) mediaId: string,
    @Body(zodPipe(z.object({}).strict())) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.cover(
        actorOf(request),
        this.key(request),
        branchId,
        mediaId,
        request.headers['if-match'],
        body,
      ),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, operation: ReturnType<GalleryService['attach']>) {
    const result = await operation;
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed))
      .header('ETag', '"' + result.body.version + '"');
    return result.body;
  }
}

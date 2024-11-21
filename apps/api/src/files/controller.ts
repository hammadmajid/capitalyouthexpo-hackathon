import { Body, Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { uploadSchema, type Upload } from '@hsm/contracts';
import { Self, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { FileService } from './service.js';
import {
  FileUploadInput,
  FileUploadResponse,
  FileDownloadResponse,
  fileStatusDocumentation,
} from './documentation.js';
export const FILE_SERVICE = Symbol('FileService');
const identifier = zodPipe(z.string().uuid());
const empty = z.object({}).strict();
@AuthProblems()
@ApiTags('Private files')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Self()
@Controller('files')
export class FileController {
  constructor(@Inject(FILE_SERVICE) private readonly service: FileService) {}
  @Post('uploads')
  @HttpCode(201)
  @FileUploadInput()
  @FileUploadResponse()
  @ApiOperation({ summary: 'SEC-003: request a private quarantine upload' })
  upload(@Req() request: FastifyRequest, @Body(zodPipe(uploadSchema)) body: Upload) {
    return this.service.upload(actorOf(request), body);
  }
  @Post(':fileId/complete')
  @HttpCode(202)
  @ApiBody({ schema: { type: 'object', additionalProperties: false, properties: {} } })
  @ApiResponse({ status: 202, schema: fileStatusDocumentation })
  @ApiOperation({ summary: 'SEC-003: validate actual content and persist scan work' })
  complete(
    @Req() request: FastifyRequest,
    @Param('fileId', identifier) id: string,
    @Body() body: unknown,
  ) {
    empty.parse(body ?? {});
    return this.service.complete(actorOf(request), id);
  }
  @Get(':fileId')
  @ApiResponse({ status: 200, schema: fileStatusDocumentation })
  @ApiOperation({ summary: 'SEC-003: read uploader-only file status' })
  read(@Req() request: FastifyRequest, @Param('fileId', identifier) id: string) {
    return this.service.read(actorOf(request), id);
  }
  @Get(':fileId/download')
  @FileDownloadResponse()
  @ApiOperation({ summary: 'SEC-003: audit self access and sign a verified private download' })
  download(@Req() request: FastifyRequest, @Param('fileId', identifier) id: string) {
    return this.service.download(actorOf(request), id);
  }
}

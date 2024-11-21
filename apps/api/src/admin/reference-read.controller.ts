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
import { Admin, actorOf } from '../access.js';
import { contractObject, idPipe } from '../services/http.js';
import { identifier } from '../inventory/documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { AdminReferenceReadService } from './reference-read.service.js';
export const ADMIN_REFERENCE = Symbol('AdminReferenceRead');
@Controller('admin')
@ApiTags('Platform reference and announcement history')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
export class AdminReferenceReadController {
  @Get('institutions/:placeId/history')
  @Admin(['verification'], true)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'institutionHistory',
    summary: 'HMA-015: Root-only allowlisted institution revision history',
  })
  @ApiParam({ name: 'placeId', schema: identifier })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiResponse({ status: 200, schema: contractObject('institutionHistoryPageSchema') })
  history(
    @Req() request: FastifyRequest,
    @Param('placeId', idPipe) id: string,
    @Query() query: unknown,
  ) {
    return this.service.institutionHistory(actorOf(request), id, query);
  }
  constructor(@Inject(ADMIN_REFERENCE) private readonly service: AdminReferenceReadService) {}
  @Get('announcement-history')
  @Admin(['support'])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminAnnouncementHistory',
    summary: 'ADM-010: complete bounded announcement delivery history',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiQuery({ name: 'status', required: false, enum: ['scheduled', 'sent', 'cancelled'] })
  @ApiResponse({ status: 200, schema: contractObject('adminAnnouncementPageSchema') })
  announcements(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.announcements(actorOf(request), query);
  }
  @Get('institutions')
  @Admin(['verification'], true)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminInstitutionList',
    summary: 'GEO-003: Root reads active and withdrawn institution identities',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 180 } })
  @ApiQuery({ name: 'active', required: false, enum: ['all', 'active', 'inactive'] })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: [
      'university',
      'office',
      'business_hub',
      'school',
      'health',
      'hotel',
      'food',
      'government',
      'library',
      'locality',
    ],
  })
  @ApiResponse({ status: 200, schema: contractObject('adminInstitutionPageSchema') })
  institutions(@Req() request: FastifyRequest, @Query() query: unknown) {
    return this.service.institutions(actorOf(request), query);
  }
  @Get('institutions/:placeId')
  @Admin(['verification'], true)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'adminInstitutionDetail',
    summary: 'GEO-003: Root reads editable institution data including approval state',
  })
  @ApiParam({ name: 'placeId', schema: identifier })
  @ApiResponse({ status: 200, schema: contractObject('adminInstitutionSchema') })
  institution(@Req() request: FastifyRequest, @Param('placeId', idPipe) id: string) {
    return this.service.institution(actorOf(request), id);
  }
}

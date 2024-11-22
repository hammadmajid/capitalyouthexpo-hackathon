import { stayRecordQuerySchema } from '@hsm/contracts';
import { agreementFileInputSchema } from '@hsm/contracts';
import { agreementAcceptanceInputSchema } from '@hsm/contracts';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject } from '../services/http.js';
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
import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { stayIdentifierSchema } from '@hsm/contracts';
import { BranchScope, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { zodPipe } from '../problem.js';
import type { StayRecordService } from './record.service.js';
import { stayRecordDocumentation } from './record.documentation.js';
export const STAY_RECORD_SERVICE = Symbol('StayRecordService');
const id = zodPipe(stayIdentifierSchema),
  empty = zodPipe(z.object({}).strict());
@ApiTags('Phase 5 Stay records')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class StayRecordController {
  constructor(@Inject(STAY_RECORD_SERVICE) private readonly service: StayRecordService) {}
  @Put('me/stays/:stayId/agreements/:agreementId/acceptance')
  @Self()
  @CookieCsrf()
  @ApiOperation({
    operationId: 'acknowledgeStayAgreement',
    summary:
      'STAY-002: authenticated acknowledgement of the exact original terms; not a digital signature',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: contractObject('agreementAcceptanceInputSchema') })
  @ApiResponse({ status: 200, schema: contractObject('agreementAcceptanceSchema') })
  async accept(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Body(zodPipe(agreementAcceptanceInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.accept(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      stayId,
      agreementId,
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
  @Get('branches/:branchId/stays/:stayId/resident-photo')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStayResidentPhoto',
    summary: 'RES-004: authorized current approved resident profile photo',
  })
  @ApiResponse({ status: 200, schema: contractObject('stayResidentPhotoSchema') })
  staffResidentPhoto(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.service.photo(actorOf(request), stayId, branchId);
  }
  @Get('me/stays/:stayId/resident-photo')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownStayResidentPhoto',
    summary: 'RES-004: authorized current approved resident profile photo',
  })
  @ApiResponse({ status: 200, schema: contractObject('stayResidentPhotoSchema') })
  ownResidentPhoto(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.service.photo(actorOf(request), stayId);
  }
  @Get('branches/:branchId/stays/:stayId/agreements/:agreementId/files')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffAgreementFiles',
    summary: 'STAY-002: paginated original agreement scans',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @ApiResponse({ status: 200, schema: contractObject('agreementFilePageSchema') })
  staffFiles(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Query() query: unknown,
  ) {
    return this.service.files(actorOf(request), stayId, agreementId, query, branchId);
  }
  @Get('branches/:branchId/stays/:stayId/agreements/:agreementId/files/:fileId/download')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffAgreementFileUrl',
    summary: 'STAY-002 / SEC-003: audited private scan/template download for the exact stay',
  })
  @ApiResponse({ status: 200, schema: contractObject('downloadResponseSchema') })
  staffFileUrl(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Param('fileId', id) fileId: string,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.service.fileUrl(actorOf(request), stayId, agreementId, fileId, branchId);
  }
  @Post('branches/:branchId/stays/:stayId/agreements/:agreementId/files')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiOperation({
    operationId: 'staffAttachAgreementFile',
    summary: 'STAY-002: append own clean scanned document to the original stay agreement',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: contractObject('agreementFileInputSchema') })
  @ApiResponse({ status: 201, schema: contractObject('agreementFileSchema') })
  async staffAttach(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Body(zodPipe(agreementFileInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    const result = await this.service.attach(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      stayId,
      agreementId,
      body,
      branchId,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
  @Get('me/stays/:stayId/agreements/:agreementId/files')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownAgreementFiles',
    summary: 'STAY-002: paginated original agreement scans',
  })
  @ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  })
  @ApiResponse({ status: 200, schema: contractObject('agreementFilePageSchema') })
  ownFiles(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Query() query: unknown,
  ) {
    return this.service.files(actorOf(request), stayId, agreementId, query);
  }
  @Get('me/stays/:stayId/agreements/:agreementId/files/:fileId/download')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownAgreementFileUrl',
    summary: 'STAY-002 / SEC-003: audited private scan/template download for the exact stay',
  })
  @ApiResponse({ status: 200, schema: contractObject('downloadResponseSchema') })
  ownFileUrl(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Param('fileId', id) fileId: string,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    return this.service.fileUrl(actorOf(request), stayId, agreementId, fileId);
  }
  @Post('me/stays/:stayId/agreements/:agreementId/files')
  @Self()
  @CookieCsrf()
  @ApiOperation({
    operationId: 'ownAttachAgreementFile',
    summary: 'STAY-002: append own clean scanned document to the original stay agreement',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({ schema: contractObject('agreementFileInputSchema') })
  @ApiResponse({ status: 201, schema: contractObject('agreementFileSchema') })
  async ownAttach(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', id) stayId: string,
    @Param('agreementId', id) agreementId: string,
    @Body(zodPipe(agreementFileInputSchema)) body: unknown,
    @Query(empty) query: unknown,
  ) {
    z.object({}).strict().parse(query);
    const result = await this.service.attach(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      stayId,
      agreementId,
      body,
    );
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
  @Get('branches/:branchId/stays/:stayId/record')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffStayRecord',
    summary: 'STAY-002 / RES-005: agreements, assignments and lifecycle; requires stay_manage',
  })
  @ApiQuery({
    name: 'beforeAgreementVersion',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiResponse({ status: 200, schema: stayRecordDocumentation })
  staff(
    @Req() request: FastifyRequest,
    @Param('branchId', id) branchId: string,
    @Param('stayId', id) stayId: string,
    @Query(zodPipe(stayRecordQuerySchema)) query: unknown,
  ) {
    return this.service.staff(actorOf(request), branchId, stayId, query);
  }
  @Get('me/stays/:stayId/record')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'customerStayRecord',
    summary: 'CHG-012 / STAY-002: own linked Stay agreement and accommodation history only',
  })
  @ApiQuery({
    name: 'beforeAgreementVersion',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 2147483647 },
  })
  @ApiResponse({ status: 200, schema: stayRecordDocumentation })
  own(
    @Req() request: FastifyRequest,
    @Param('stayId', id) stayId: string,
    @Query(zodPipe(stayRecordQuerySchema)) query: unknown,
  ) {
    return this.service.own(actorOf(request), stayId, query);
  }
}

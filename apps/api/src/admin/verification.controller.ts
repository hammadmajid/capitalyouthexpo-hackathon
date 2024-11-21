import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  applyDecorators,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { Admin, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject, idPipe } from '../services/http.js';
import { VerificationReadService } from './verification-read.service.js';
export const VERIFICATION_READ = Symbol('VerificationRead');
const paging = () =>
  applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    }),
  );
@ApiTags('Verification review')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Admin(['verification'])
@Controller('admin/verifications')
export class VerificationReadController {
  constructor(@Inject(VERIFICATION_READ) private readonly reader: VerificationReadService) {}
  @Get(':branchId/submissions')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'readVerificationSnapshots',
    summary: 'TRUST-002: immutable latest submission versus last approved allowlisted comparison',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationSnapshotComparisonSchema') })
  snapshots(@Req() req: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.reader.snapshots(actorOf(req), branchId);
  }
  @Get(':branchId/submissions/:submissionId/items')
  @Header('Cache-Control', 'no-store')
  @paging()
  @ApiQuery({ name: 'kind', required: true, enum: ['pricing', 'photo'] })
  @ApiOperation({
    operationId: 'readVerificationSnapshotItems',
    summary: 'TRUST-002: bounded immutable submission prices/photos',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationSnapshotItemsSchema') })
  snapshotItems(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('submissionId', idPipe) submissionId: string,
    @Query() query: unknown,
  ) {
    return this.reader.snapshotItems(actorOf(req), branchId, submissionId, query);
  }
  @Get(':branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'readVerificationDossier',
    summary: 'TRUST-002: current branch-bound verification dossier',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationDossierSchema') })
  dossier(@Req() req: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.reader.dossier(actorOf(req), branchId);
  }
  @Get(':branchId/history')
  @Header('Cache-Control', 'no-store')
  @paging()
  @ApiOperation({
    operationId: 'readVerificationHistory',
    summary: 'ADM-007: bounded verification history',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationHistorySchema') })
  history(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.reader.history(actorOf(req), branchId, query);
  }
  @Post(':branchId/evidence/:fileId/access')
  @CookieCsrf()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['justification'],
      properties: { justification: { type: 'string', minLength: 8, maxLength: 500 } },
    },
  })
  @ApiOperation({
    operationId: 'readVerificationEvidence',
    summary: 'SEC-003 TRUST-002: purpose-bound audited evidence URL',
  })
  @ApiResponse({ status: 200, schema: contractObject('downloadResponseSchema') })
  evidence(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('fileId', idPipe) fileId: string,
    @Body() input: unknown,
  ) {
    return this.reader.evidence(actorOf(req), branchId, fileId, input);
  }
  @Get(':branchId/pricing')
  @Header('Cache-Control', 'no-store')
  @paging()
  @ApiOperation({
    operationId: 'readVerificationPricing',
    summary: 'TRUST-002: branch room-type prices and deposits, no occupant data',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationPricingSchema') })
  pricing(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.reader.pricing(actorOf(req), branchId, query);
  }
  @Get(':branchId/photos')
  @Header('Cache-Control', 'no-store')
  @paging()
  @ApiOperation({
    operationId: 'readVerificationPhotos',
    summary: 'TRUST-002: branch-bound listing-photo metadata',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationPhotosSchema') })
  photos(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.reader.photos(actorOf(req), branchId, query);
  }
}

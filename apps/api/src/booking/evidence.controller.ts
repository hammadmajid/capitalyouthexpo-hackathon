import { Controller, Get, Inject, Param, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { FileDownloadResponse } from '../files/documentation.js';
import { BookingEvidenceService } from './evidence.service.js';
export const BOOKING_EVIDENCE_SERVICE = Symbol('BookingEvidenceService');
const identifier = zodPipe(z.string().uuid());
@BranchScope('branchId', true)
@AuthProblems()
@ApiTags('Private booking evidence')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/booking-documents')
export class BookingEvidenceController {
  constructor(@Inject(BOOKING_EVIDENCE_SERVICE) private readonly service: BookingEvidenceService) {}
  @Get(':documentId/download')
  @FileDownloadResponse()
  @ApiOperation({ summary: 'SEC-003 / CHG-008: audited Owner-only booking-document download' })
  download(
    @Req() request: FastifyRequest,
    @Param('branchId', identifier) branchId: string,
    @Param('documentId', identifier) documentId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
    return this.service.download(actorOf(request), branchId, documentId);
  }
}

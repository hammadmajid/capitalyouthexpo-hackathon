import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  calendarDateSchema,
  managementPageSchema,
  visitInterestInputSchema,
  createVisitInputSchema,
  saveVisitingHoursSchema,
  visitActionInputSchema,
  visitListQuerySchema,
} from '@hsm/contracts';
import { actorOf, BranchScope, Customer, Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { VisitService } from './service.js';
import {
  VisitMutation,
  VisitHistoryPaging,
  visitInterestDocumentation,
  visitInterestInputDocumentation,
  VisitPaging,
  createVisitDocumentation,
  hoursDocumentation,
  hoursInputDocumentation,
  slotsDocumentation,
  visitActionDocumentation,
} from './documentation.js';
export const VISIT_SERVICE = Symbol('VisitService');
const identifier = z.string().uuid(),
  pipe = zodPipe(identifier);
@ApiTags('Visits')
@AuthProblems()
@Controller()
export class VisitController {
  constructor(@Inject(VISIT_SERVICE) private readonly service: VisitService) {}
  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('public/hostels/:slug/visit-slots')
  @ApiOperation({
    operationId: 'readVisitSlots',
    summary: 'VISIT-001: selected-date visiting windows without a fabricated slot duration',
  })
  @ApiQuery({ name: 'date', required: true, schema: { type: 'string', format: 'date' } })
  @ApiResponse({ status: 200, schema: slotsDocumentation })
  slots(
    @Param('slug', zodPipe(z.string().min(1).max(160))) slug: string,
    @Query(zodPipe(z.object({ date: calendarDateSchema }).strict())) query: { date: string },
  ) {
    return this.service.publicHours(slug, query.date);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get('branches/:branchId/visiting-hours')
  @ApiOperation({
    operationId: 'readVisitingHours',
    summary: 'VISIT-001: current authorized weekly configuration',
  })
  @ApiResponse({ status: 200, schema: hoursDocumentation })
  hours(@Req() request: FastifyRequest, @Param('branchId', pipe) branchId: string) {
    return this.service.hours(actorOf(request), branchId);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @BranchScope()
  @Put('branches/:branchId/visiting-hours')
  @VisitMutation(hoursInputDocumentation, hoursDocumentation)
  @ApiOperation({
    operationId: 'saveVisitingHours',
    summary: 'VISIT-001 / ACC-006: audited preconditioned weekly configuration',
  })
  saveHours(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Body(zodPipe(saveVisitingHoursSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.saveHours(actorOf(request), this.key(request), branchId, body),
    );
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get('me/visits')
  @VisitPaging()
  @ApiOperation({ operationId: 'listOwnVisits', summary: 'VISIT-001 / SEC-003: own visits only' })
  own(@Req() request: FastifyRequest, @Query(zodPipe(visitListQuerySchema)) query: unknown) {
    return this.service.list(actorOf(request), query);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get('branches/:branchId/visits')
  @VisitPaging()
  @ApiOperation({
    operationId: 'listBranchVisits',
    summary: 'VISIT-001 / ACC-002: exact authorized branch visits',
  })
  branch(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Query(zodPipe(visitListQuerySchema)) query: unknown,
  ) {
    return this.service.list(actorOf(request), query, branchId);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @Customer()
  @Post('me/visits')
  @HttpCode(201)
  @VisitMutation(createVisitDocumentation, undefined, 201)
  @ApiOperation({
    operationId: 'createVisit',
    summary: 'VISIT-001: request a future time inside current public-hostel hours',
  })
  create(
    @Req() request: FastifyRequest,
    @Body(zodPipe(createVisitInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(reply, this.service.create(actorOf(request), this.key(request), body));
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @Customer()
  @Post('me/visits/:visitId/actions')
  @HttpCode(200)
  @VisitMutation(visitActionDocumentation)
  @ApiOperation({
    operationId: 'actOnOwnVisit',
    summary: 'VISIT-001: cancel or explicitly accept the reviewed proposal',
  })
  ownAction(
    @Req() request: FastifyRequest,
    @Param('visitId', pipe) visitId: string,
    @Body(zodPipe(visitActionInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.action(actorOf(request), this.key(request), visitId, body),
    );
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @BranchScope()
  @Post('branches/:branchId/visits/:visitId/actions')
  @HttpCode(200)
  @VisitMutation(visitActionDocumentation)
  @ApiOperation({
    operationId: 'actOnBranchVisit',
    summary: 'VISIT-001 / ACC-006: approve, propose reschedule, reject or record visit outcome',
  })
  branchAction(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('visitId', pipe) visitId: string,
    @Body(zodPipe(visitActionInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.action(actorOf(request), this.key(request), visitId, body, branchId),
    );
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get('me/visits/:visitId/history')
  @VisitHistoryPaging()
  @ApiOperation({
    operationId: 'readOwnVisitHistory',
    summary: 'VISIT-001 / SEC-003: own immutable visit history',
  })
  ownHistory(
    @Req() request: FastifyRequest,
    @Param('visitId', pipe) visitId: string,
    @Query(zodPipe(managementPageSchema)) query: unknown,
  ) {
    return this.service.history(actorOf(request), visitId, query);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get('branches/:branchId/visits/:visitId/history')
  @VisitHistoryPaging()
  @ApiOperation({
    operationId: 'readBranchVisitHistory',
    summary: 'VISIT-001 / ACC-002: scoped immutable visit history',
  })
  branchHistory(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('visitId', pipe) visitId: string,
    @Query(zodPipe(managementPageSchema)) query: unknown,
  ) {
    return this.service.history(actorOf(request), visitId, query, branchId);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get('me/visits/:visitId/interest')
  @ApiResponse({ status: 200, schema: visitInterestDocumentation })
  @ApiOperation({
    operationId: 'readOwnVisitInterest',
    summary: 'VISIT-001: own completed-visit interest response',
  })
  ownInterest(@Req() request: FastifyRequest, @Param('visitId', pipe) visitId: string) {
    return this.service.interest(actorOf(request), visitId);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get('branches/:branchId/visits/:visitId/interest')
  @ApiResponse({ status: 200, schema: visitInterestDocumentation })
  @ApiOperation({
    operationId: 'readBranchVisitInterest',
    summary: 'VISIT-001 / ACC-002: authorized completed-visit customer response',
  })
  branchInterest(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('visitId', pipe) visitId: string,
  ) {
    return this.service.interest(actorOf(request), visitId, branchId);
  }
  @ApiSecurity('bearer')
  @ApiSecurity('cookie')
  @Customer()
  @Post('me/visits/:visitId/interest')
  @HttpCode(200)
  @VisitMutation(visitInterestInputDocumentation, visitInterestDocumentation)
  @ApiOperation({
    operationId: 'recordOwnVisitInterest',
    summary: 'VISIT-001: explicit version-bound post-visit interest response',
  })
  recordInterest(
    @Req() request: FastifyRequest,
    @Param('visitId', pipe) visitId: string,
    @Body(zodPipe(visitInterestInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.recordInterest(actorOf(request), this.key(request), visitId, body),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(
    reply: FastifyReply,
    work: Promise<{ status: number; body: unknown; replayed: boolean }>,
  ) {
    const result = await work;
    reply
      .code(result.status)
      .header('Cache-Control', 'no-store')
      .header('Idempotency-Replayed', String(result.replayed));
    return result.body;
  }
}

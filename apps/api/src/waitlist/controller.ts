import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { joinWaitlistSchema, waitlistQuerySchema } from '@hsm/contracts';
import { actorOf, BranchScope, Customer, Public } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { WaitlistService } from './service.js';
import {
  publicWaitlistOpenDocumentation,
  WaitlistMutation,
  WaitlistPaging,
} from './documentation.js';
export const WAITLIST_SERVICE = Symbol('WaitlistService');
const identifier = z.string().uuid(),
  pipe = zodPipe(identifier);
@ApiTags('Waiting list')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class WaitlistController {
  constructor(@Inject(WAITLIST_SERVICE) private readonly service: WaitlistService) {}
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get('me/waitlist')
  @WaitlistPaging()
  @ApiOperation({
    operationId: 'listOwnWaitlist',
    summary: 'WAIT-001 / SEC-003: own waiting-list history',
  })
  own(@Req() request: FastifyRequest, @Query(zodPipe(waitlistQuerySchema)) query: unknown) {
    return this.service.list(actorOf(request), query);
  }
  @Public()
  @Header('Cache-Control', 'no-store')
  @Get('marketplace/:branchId/waitlist-open')
  @ApiOperation({
    operationId: 'publicWaitlistOpen',
    summary: 'CHG-040: whether a waiting list is open (a resident gave notice); ids only',
  })
  @ApiResponse({ status: 200, schema: publicWaitlistOpenDocumentation })
  publicOpen(@Param('branchId', pipe) branchId: string) {
    return this.service.publicOpen(branchId);
  }
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get('branches/:branchId/waitlist')
  @WaitlistPaging(true)
  @ApiOperation({
    operationId: 'listBranchWaitlist',
    summary: 'WAIT-001 / ACC-002: scoped names without private contact details',
  })
  branch(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Query(zodPipe(waitlistQuerySchema)) query: unknown,
  ) {
    return this.service.list(actorOf(request), query, branchId);
  }
  @Customer()
  @Post('me/waitlist')
  @HttpCode(200)
  @WaitlistMutation(true)
  @ApiOperation({
    operationId: 'joinWaitlist',
    summary: 'WAIT-001: get or create an active preference; never reserve inventory',
  })
  join(
    @Req() request: FastifyRequest,
    @Body(zodPipe(joinWaitlistSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.join(
        actorOf(request),
        identifier.parse(request.headers['idempotency-key']),
        body,
      ),
    );
  }
  @Customer()
  @Delete('me/waitlist/:entryId')
  @HttpCode(200)
  @WaitlistMutation()
  @ApiOperation({
    operationId: 'leaveWaitlist',
    summary: 'WAIT-001 / SEC-003: leave an own preference, preserving history',
  })
  leave(
    @Req() request: FastifyRequest,
    @Param('entryId', pipe) entryId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return this.respond(
      reply,
      this.service.leave(
        actorOf(request),
        identifier.parse(request.headers['idempotency-key']),
        entryId,
      ),
    );
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

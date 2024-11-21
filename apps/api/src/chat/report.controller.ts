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
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  chatReportInputSchema,
  chatReportPageQuerySchema,
  chatSafetyAccessSchema,
} from '@hsm/contracts';
import { Admin, BranchScope, Customer, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CHAT_SERVICE, chatKey, chatResponse } from './controller.js';
import { ChatService } from './service.js';
import { ChatMutation } from './documentation.js';
import {
  ReportPaging,
  SafetyContextResponse,
  reportDocumentation,
  reportInputDocumentation,
} from './report.documentation.js';
const pipe = zodPipe(z.string().uuid());
@ApiTags('Chat reports')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('me/reports')
export class CustomerChatReportController {
  constructor(@Inject(CHAT_SERVICE) private readonly service: ChatService) {}
  @Customer()
  @Post()
  @HttpCode(201)
  @ChatMutation(reportInputDocumentation, reportDocumentation, 201)
  @ApiOperation({
    operationId: 'reportOwnChatMessage',
    summary: 'COMM-002: report an authorized private message without granting blanket admin access',
  })
  create(
    @Req() request: FastifyRequest,
    @Body(zodPipe(chatReportInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(
      reply,
      this.service.reporting.create(actorOf(request), chatKey(request), body),
    );
  }
}
@ApiTags('Chat reports')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('branches/:branchId/conversations/:conversationId/reports')
export class BranchChatReportController {
  constructor(@Inject(CHAT_SERVICE) private readonly service: ChatService) {}
  @BranchScope()
  @Post()
  @HttpCode(201)
  @ChatMutation(reportInputDocumentation, reportDocumentation, 201)
  @ApiOperation({
    operationId: 'reportBranchChatMessage',
    summary: 'COMM-002 / SEC-003: audited current branch participant report',
  })
  create(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('conversationId', pipe) conversationId: string,
    @Body(zodPipe(chatReportInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(
      reply,
      this.service.reporting.create(
        actorOf(request),
        chatKey(request),
        body,
        branchId,
        conversationId,
      ),
    );
  }
}
@ApiTags('Chat safety cases')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('admin/reports')
export class ChatSafetyReportsController {
  constructor(@Inject(CHAT_SERVICE) private readonly service: ChatService) {}
  @Admin(['support', 'content_moderator'])
  @Get()
  @Header('Cache-Control', 'no-store')
  @ReportPaging()
  @ApiOperation({
    operationId: 'listChatSafetyReports',
    summary: 'COMM-002: current authorized safety-case metadata queue',
  })
  list(@Req() request: FastifyRequest, @Query(zodPipe(chatReportPageQuerySchema)) query: unknown) {
    return this.service.reporting.list(actorOf(request), query);
  }
  @Admin(['support', 'content_moderator'])
  @Post(':reportId/chat-context')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @SafetyContextResponse()
  @ApiOperation({
    operationId: 'readReportedChatContext',
    summary: 'COMM-002: justified and transactionally audited reported message window only',
  })
  context(
    @Req() request: FastifyRequest,
    @Param('reportId', pipe) reportId: string,
    @Body(zodPipe(chatSafetyAccessSchema)) body: unknown,
  ) {
    return this.service.reporting.context(actorOf(request), reportId, body);
  }
}

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
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { chatMessageInputSchema, chatPageQuerySchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { ChatService } from './service.js';
import { FileDownloadResponse } from '../files/documentation.js';
import { CHAT_SERVICE, chatKey, chatResponse } from './controller.js';
import {
  ChatMutation,
  ChatPaging,
  messageDocumentation,
  messageInputDocumentation,
  readDocumentation,
} from './documentation.js';
const pipe = zodPipe(z.string().uuid());
@ApiTags('Chat')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('branches/:branchId/conversations')
export class BranchChatController {
  constructor(@Inject(CHAT_SERVICE) private readonly service: ChatService) {}
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get(':conversationId/attachments/:fileId/download')
  @FileDownloadResponse()
  @ApiOperation({
    operationId: 'downloadBranchChatAttachment',
    summary: 'COMM-001 / COMM-002: current branch participant audited signed download',
  })
  download(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('conversationId', pipe) conversationId: string,
    @Param('fileId', pipe) fileId: string,
  ) {
    return this.service.download(actorOf(request), conversationId, fileId, branchId);
  }
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get()
  @ChatPaging()
  @ApiOperation({
    operationId: 'listBranchConversations',
    summary: 'COMM-001 / ACC-002: assigned branch inbox',
  })
  list(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Query(zodPipe(chatPageQuerySchema)) query: unknown,
  ) {
    return this.service.list(actorOf(request), query, branchId);
  }
  @BranchScope()
  @Header('Cache-Control', 'no-store')
  @Get(':conversationId/messages')
  @ChatPaging(true)
  @ApiOperation({
    operationId: 'readBranchMessages',
    summary: 'COMM-001 / COMM-002: participant-only branch history',
  })
  messages(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('conversationId', pipe) conversationId: string,
    @Query(zodPipe(chatPageQuerySchema)) query: unknown,
  ) {
    return this.service.messages(actorOf(request), conversationId, query, branchId);
  }
  @BranchScope()
  @Post(':conversationId/messages')
  @HttpCode(201)
  @ChatMutation(messageInputDocumentation, messageDocumentation, 201)
  @ApiOperation({
    operationId: 'sendBranchMessage',
    summary: 'COMM-001 / ACC-006: audited scoped hostel reply',
  })
  send(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('conversationId', pipe) conversationId: string,
    @Body(zodPipe(chatMessageInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(
      reply,
      this.service.send(actorOf(request), chatKey(request), conversationId, body, branchId),
    );
  }
  @BranchScope()
  @Post(':conversationId/read')
  @HttpCode(200)
  @ChatMutation(undefined, readDocumentation)
  @ApiOperation({
    operationId: 'markBranchConversationRead',
    summary: 'COMM-001: current staff read marker',
  })
  read(
    @Req() request: FastifyRequest,
    @Param('branchId', pipe) branchId: string,
    @Param('conversationId', pipe) conversationId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(
      reply,
      this.service.read(actorOf(request), chatKey(request), conversationId, branchId),
    );
  }
}

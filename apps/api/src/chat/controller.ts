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
import {
  chatMessageInputSchema,
  chatPageQuerySchema,
  createConversationSchema,
} from '@hsm/contracts';
import { Customer, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { identifier, object } from '../inventory/documentation.js';
import { ChatService } from './service.js';
import { FileDownloadResponse } from '../files/documentation.js';
import {
  ChatMutation,
  ChatPaging,
  conversationDocumentation,
  messageDocumentation,
  messageInputDocumentation,
  readDocumentation,
} from './documentation.js';
export const CHAT_SERVICE = Symbol('ChatService');
const id = z.string().uuid(),
  pipe = zodPipe(id);
export async function chatResponse(
  reply: FastifyReply,
  work: Promise<{ status: number; body: unknown; replayed: boolean }>,
) {
  const response = await work;
  reply
    .code(response.status)
    .header('Cache-Control', 'no-store')
    .header('Idempotency-Replayed', String(response.replayed));
  return response.body;
}
export const chatKey = (request: FastifyRequest) => id.parse(request.headers['idempotency-key']);
@ApiTags('Chat')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller('me/conversations')
export class ChatController {
  constructor(@Inject(CHAT_SERVICE) private readonly service: ChatService) {}
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get(':conversationId/attachments/:fileId/download')
  @FileDownloadResponse()
  @ApiOperation({
    operationId: 'downloadOwnChatAttachment',
    summary: 'COMM-001 / SEC-003: clean participant-only audited signed download',
  })
  download(
    @Req() request: FastifyRequest,
    @Param('conversationId', pipe) conversationId: string,
    @Param('fileId', pipe) fileId: string,
  ) {
    return this.service.download(actorOf(request), conversationId, fileId);
  }
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get()
  @ChatPaging()
  @ApiOperation({
    operationId: 'listOwnConversations',
    summary: 'COMM-001 / SEC-003: own customer threads only',
  })
  list(@Req() request: FastifyRequest, @Query(zodPipe(chatPageQuerySchema)) query: unknown) {
    return this.service.list(actorOf(request), query);
  }
  @Customer()
  @Post()
  @HttpCode(200)
  @ChatMutation(object({ branchId: identifier }), conversationDocumentation)
  @ApiOperation({
    operationId: 'createConversation',
    summary: 'COMM-001: get or create own customer/hostel conversation',
  })
  create(
    @Req() request: FastifyRequest,
    @Body(zodPipe(createConversationSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(reply, this.service.create(actorOf(request), chatKey(request), body));
  }
  @Customer()
  @Header('Cache-Control', 'no-store')
  @Get(':conversationId/messages')
  @ChatPaging(true)
  @ApiOperation({
    operationId: 'readOwnMessages',
    summary: 'COMM-001 / SEC-003: private newest-first history',
  })
  messages(
    @Req() request: FastifyRequest,
    @Param('conversationId', pipe) conversationId: string,
    @Query(zodPipe(chatPageQuerySchema)) query: unknown,
  ) {
    return this.service.messages(actorOf(request), conversationId, query);
  }
  @Customer()
  @Post(':conversationId/messages')
  @HttpCode(201)
  @ChatMutation(messageInputDocumentation, messageDocumentation, 201)
  @ApiOperation({
    operationId: 'sendOwnMessage',
    summary: 'COMM-001: retry-safe customer message with clean own attachments',
  })
  send(
    @Req() request: FastifyRequest,
    @Param('conversationId', pipe) conversationId: string,
    @Body(zodPipe(chatMessageInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(
      reply,
      this.service.send(actorOf(request), chatKey(request), conversationId, body),
    );
  }
  @Customer()
  @Post(':conversationId/read')
  @HttpCode(200)
  @ChatMutation(undefined, readDocumentation)
  @ApiOperation({
    operationId: 'markOwnConversationRead',
    summary: 'COMM-001: own conversation read marker',
  })
  read(
    @Req() request: FastifyRequest,
    @Param('conversationId', pipe) conversationId: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return chatResponse(
      reply,
      this.service.read(actorOf(request), chatKey(request), conversationId),
    );
  }
}

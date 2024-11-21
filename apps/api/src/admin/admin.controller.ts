import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
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
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  platformAdminRoleSchema,
  supportStatusSchema,
  verificationActionSchema,
  verificationStatusSchema,
} from '@hsm/contracts';
import { Admin, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object } from '../inventory/documentation.js';
import { contractObject, idPipe, idempotencyHeader, replay, version } from '../services/http.js';
import type { AdminAccountService } from './admins.service.js';
import type { GovernanceService } from './governance.service.js';
import type { SupportService } from './support.service.js';
export const PLATFORM_ADMIN = Symbol('PlatformAdmin');
export type PlatformAdmin = {
  admins: AdminAccountService;
  governance: GovernanceService;
  support: SupportService;
};
const text = (max: number) => ({ type: 'string' as const, maxLength: max });
const page = [
  { name: 'cursor', required: false, schema: identifier },
  { name: 'limit', required: false, schema: { type: 'integer', minimum: 1, maximum: 50 } },
] as const;
type Request = FastifyRequest;
type Reply = FastifyReply;
const key = (request: Request) => request.headers['idempotency-key'];
@ApiTags('Phase 10 platform administration')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class PlatformAdminController {
  constructor(@Inject(PLATFORM_ADMIN) private readonly admin: PlatformAdmin) {}
  @Get('admin/admins')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
  })
  @ApiOperation({ operationId: 'listAdmins', summary: 'ADM-001..006: Root view of every admin' })
  @ApiResponse({ status: 200, schema: contractObject('adminAccountListSchema') })
  list(@Req() request: Request, @Query() query: unknown = {}) {
    return this.admin.admins.list(actorOf(request), query);
  }
  @Get('admin/admins/:userId')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'readAdminAccount',
    summary: 'ADM-001: Root reads one Admin account',
  })
  @ApiResponse({ status: 200, schema: contractObject('adminAccountSchema') })
  detail(@Req() request: Request, @Param('userId', idPipe) userId: string) {
    return this.admin.admins.detail(actorOf(request), userId);
  }
  @Post('admin/admins')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'inviteAdmin',
    summary: 'ADM-002: Root invites an existing account as a Normal Admin',
  })
  @ApiBody({
    schema: object({
      email: text(254),
      roles: {
        type: 'array',
        maxItems: 3,
        items: { type: 'string', enum: platformAdminRoleSchema.options },
      },
    }),
  })
  @ApiResponse({ status: 201, schema: contractObject('adminAccountSchema') })
  async invite(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Body() body: unknown,
  ) {
    return replay(reply, await this.admin.admins.invite(actorOf(request), key(request), body));
  }
  @Post('admin/admins/:userId/changes')
  @Admin(['verification', 'support', 'content_moderator'], true)
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'changeAdmin',
    summary: 'ADM-003..006: roles, status or Root membership (1..3 Roots)',
  })
  @ApiBody({
    schema: {
      oneOf: [
        object({
          change: { type: 'string', enum: ['roles'] },
          roles: {
            type: 'array',
            items: { type: 'string', enum: platformAdminRoleSchema.options },
          },
          reason: text(500),
        }),
        object({
          change: { type: 'string', enum: ['status'] },
          status: { type: 'string', enum: ['active', 'suspended', 'deactivated'] },
          reason: text(500),
        }),
        object({
          change: { type: 'string', enum: ['root'] },
          isRoot: { type: 'boolean' },
          reason: text(500),
        }),
      ],
    },
  })
  @ApiResponse({ status: 200, schema: contractObject('adminAccountSchema') })
  async change(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('userId', idPipe) userId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.admin.admins.change(actorOf(request), key(request), userId, body),
    );
  }
  @Get('admin/me')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownAdminAccount',
    summary: 'The caller’s own admin record (invited or active)',
  })
  @ApiResponse({ status: 200, schema: contractObject('adminAccountSchema') })
  me(@Req() request: Request) {
    return this.admin.admins.me(actorOf(request));
  }
  @Post('admin/me/accept')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'acceptAdminInvitation',
    summary: 'ADM-002: activate one’s own pending admin access',
  })
  @ApiResponse({ status: 200, schema: contractObject('adminAccountSchema') })
  async accept(@Req() request: Request, @Res({ passthrough: true }) reply: Reply) {
    return replay(reply, await this.admin.admins.accept(actorOf(request), key(request)));
  }
  @Get('admin/verifications')
  @Admin(['verification'])
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'status', required: false, enum: verificationStatusSchema.options })
  @ApiQuery(page[0])
  @ApiQuery(page[1])
  @ApiOperation({
    operationId: 'verificationQueue',
    summary: 'ADM-007: branches awaiting verification',
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationQueueSchema') })
  verifications(@Req() request: Request, @Query() query: unknown) {
    return this.admin.governance.verificationQueue(actorOf(request), query);
  }
  @Post('admin/verifications/:branchId')
  @Admin(['verification'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'decideVerification',
    summary: 'ADM-007: review, request changes, approve, reject, suspend or reinstate',
  })
  @ApiBody({
    schema: object(
      {
        action: { type: 'string', enum: verificationActionSchema.options },
        reason: text(1000),
        expectedStatus: { type: 'string', enum: verificationStatusSchema.options },
        expectedUpdatedAt: { type: 'string', format: 'date-time' },
      },
      ['reason', 'expectedStatus', 'expectedUpdatedAt'],
    ),
  })
  @ApiResponse({ status: 200, schema: contractObject('verificationQueueItemSchema') })
  async verify(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('branchId', idPipe) branchId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.admin.governance.decideVerification(
        actorOf(request),
        key(request),
        branchId,
        body,
      ),
    );
  }
  @Get('admin/review-reports')
  @Admin(['content_moderator'])
  @Header('Cache-Control', 'no-store')
  @ApiQuery(page[0])
  @ApiQuery(page[1])
  @ApiOperation({ operationId: 'reviewReportQueue', summary: 'ADM-008: open review reports' })
  @ApiResponse({ status: 200, schema: contractObject('reviewReportQueueSchema') })
  reviewReports(@Req() request: Request, @Query() query: unknown) {
    return this.admin.governance.reviewReports(actorOf(request), query);
  }
  @Post('admin/reviews/:reviewId/moderation')
  @Admin(['content_moderator'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'moderateReview',
    summary: 'REV-006: hide, remove or restore for a stated policy reason',
  })
  @ApiBody({
    schema: object(
      {
        action: { type: 'string', enum: ['hide', 'remove', 'restore'] },
        expectedVersion: version,
        reason: text(500),
        reportId: identifier,
      },
      ['reportId'],
    ),
  })
  @ApiResponse({
    status: 200,
    schema: object({
      reviewId: identifier,
      status: { type: 'string', enum: ['published', 'hidden', 'removed'] },
      version,
    }),
  })
  async moderate(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('reviewId', idPipe) reviewId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.admin.governance.moderateReview(actorOf(request), key(request), reviewId, body),
    );
  }
  @Post('admin/review-reports/:reportId/dismiss')
  @Admin(['content_moderator'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'dismissReviewReport',
    summary: 'ADM-008: no policy violation; the review stays',
  })
  @ApiBody({ schema: object({ reason: text(500) }) })
  @ApiResponse({
    status: 200,
    schema: object({ reportId: identifier, status: { type: 'string', enum: ['dismissed'] } }),
  })
  async dismiss(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('reportId', idPipe) reportId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.admin.governance.dismissReport(actorOf(request), key(request), reportId, body),
    );
  }
  @Get('admin/support-tickets')
  @Admin(['support'])
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'status', required: false, enum: supportStatusSchema.options })
  @ApiQuery({ name: 'priority', required: false, enum: ['normal', 'high', 'critical'] })
  @ApiQuery({
    name: 'q',
    required: false,
    schema: { type: 'string', minLength: 1, maxLength: 160 },
  })
  @ApiQuery(page[0])
  @ApiQuery(page[1])
  @ApiOperation({ operationId: 'supportQueue', summary: 'ADM-009: platform support queue' })
  @ApiResponse({ status: 200, schema: contractObject('supportTicketPageSchema') })
  supportQueue(@Req() request: Request, @Query() query: unknown) {
    return this.admin.support.queue(actorOf(request), query);
  }
  @Get('admin/support-tickets/:ticketId')
  @Admin(['support'])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'supportTicketAdmin',
    summary: 'ADM-009: ticket with internal notes',
  })
  @ApiResponse({ status: 200, schema: contractObject('supportTicketSchema') })
  supportTicket(@Req() request: Request, @Param('ticketId', idPipe) ticketId: string) {
    return this.admin.support.staffDetail(actorOf(request), ticketId);
  }
  @Post('admin/support-tickets/:ticketId/actions')
  @Admin(['support'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'supportAction',
    summary: 'ADM-009: reply, note, assign, prioritize or change status',
  })
  @ApiBody({
    schema: object(
      {
        expectedVersion: version,
        status: { type: 'string', enum: supportStatusSchema.options },
        priority: { type: 'string', enum: ['normal', 'high', 'critical'] },
        assignToMe: { type: 'boolean' },
        body: text(4000),
        internal: { type: 'boolean' },
      },
      ['status', 'priority', 'assignToMe', 'body', 'internal'],
    ),
  })
  @ApiResponse({ status: 200, schema: contractObject('supportTicketSchema') })
  async supportAct(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('ticketId', idPipe) ticketId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.admin.support.staffAct(actorOf(request), key(request), ticketId, body),
    );
  }
  @Get('admin/announcements')
  @Admin(['support'])
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listAnnouncements', summary: 'ADM-010: recent announcements' })
  @ApiResponse({ status: 200, schema: contractObject('announcementListSchema') })
  announcements(@Req() request: Request) {
    return this.admin.support.announcementsList(actorOf(request));
  }
  @Post('admin/announcements')
  @Admin(['support'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'createAnnouncement',
    summary: 'ADM-010: plain-text in-app announcement, now or scheduled',
  })
  @ApiBody({
    schema: object(
      {
        audience: {
          type: 'string',
          enum: ['all_managers', 'selected_branches', 'customers', 'city'],
        },
        branchIds: { type: 'array', maxItems: 200, items: identifier },
        cityId: identifier,
        title: text(120),
        body: text(2000),
        scheduledAt: { type: 'string', format: 'date-time' },
      },
      ['branchIds', 'cityId', 'scheduledAt'],
    ),
  })
  @ApiResponse({ status: 201, schema: contractObject('announcementSchema') })
  async announce(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Body() body: unknown,
  ) {
    return replay(reply, await this.admin.support.announce(actorOf(request), key(request), body));
  }
  @Post('admin/announcements/:announcementId/cancel')
  @Admin(['support'])
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'cancelAnnouncement', summary: 'ADM-010: cancel before delivery' })
  @ApiResponse({ status: 200, schema: contractObject('announcementSchema') })
  async cancel(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('announcementId', idPipe) announcementId: string,
  ) {
    return replay(
      reply,
      await this.admin.support.cancelAnnouncement(actorOf(request), key(request), announcementId),
    );
  }
  @Post('support/tickets')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'openSupportTicket',
    summary: 'ADM-009: Help & Support (not hostel complaints)',
  })
  @ApiBody({
    schema: object({
      subject: text(160),
      category: {
        type: 'string',
        enum: ['account', 'listing', 'booking', 'payment', 'technical', 'other'],
      },
      body: text(4000),
    }),
  })
  @ApiResponse({ status: 201, schema: contractObject('supportTicketSchema') })
  async open(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Body() body: unknown,
  ) {
    return replay(reply, await this.admin.support.open(actorOf(request), key(request), body));
  }
  @Get('support/tickets')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'status', required: false, enum: supportStatusSchema.options })
  @ApiQuery(page[0])
  @ApiQuery(page[1])
  @ApiOperation({ operationId: 'ownSupportTickets', summary: 'ADM-009: own tickets' })
  @ApiResponse({ status: 200, schema: contractObject('supportTicketPageSchema') })
  ownTickets(@Req() request: Request, @Query() query: unknown) {
    return this.admin.support.ownPage(actorOf(request), query);
  }
  @Get('support/tickets/:ticketId')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'ownSupportTicket',
    summary: 'ADM-009: own ticket without internal notes',
  })
  @ApiResponse({ status: 200, schema: contractObject('supportTicketSchema') })
  ownTicket(@Req() request: Request, @Param('ticketId', idPipe) ticketId: string) {
    return this.admin.support.ownDetail(actorOf(request), ticketId);
  }
  @Post('support/tickets/:ticketId/replies')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'replySupportTicket', summary: 'ADM-009: reply to own ticket' })
  @ApiBody({ schema: object({ body: text(4000) }) })
  @ApiResponse({ status: 200, schema: contractObject('supportTicketSchema') })
  async replyOwn(
    @Req() request: Request,
    @Res({ passthrough: true }) reply: Reply,
    @Param('ticketId', idPipe) ticketId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.admin.support.reply(actorOf(request), key(request), ticketId, body),
    );
  }
}

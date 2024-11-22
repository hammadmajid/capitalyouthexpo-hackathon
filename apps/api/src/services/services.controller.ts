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
import type { FastifyReply, FastifyRequest } from 'fastify';
import { mealSchema, transportSubscriptionStatusSchema } from '@hsm/contracts';
import { BranchScope, Public, Self, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object } from '../inventory/documentation.js';
import type { MenuService } from './menu.service.js';
import type { TransportRouteService } from './transport-routes.service.js';
import type { TransportSubscriptionService } from './transport-subscriptions.service.js';
import { contractObject, date, idPipe, idempotencyHeader, money, replay, version } from './http.js';
export const RESIDENT_SERVICES = Symbol('ResidentServices');
export type ResidentServices = {
  menu: MenuService;
  routes: TransportRouteService;
  subscriptions: TransportSubscriptionService;
};
const menu = contractObject('branchMenuSchema: { branchId, version, updatedAt, items[], times[] }');
const route = contractObject('transportRouteSchema');
const routeList = object(
  {
    branchId: identifier,
    data: { type: 'array', maxItems: 50, items: route },
    offer: {
      type: 'object',
      nullable: true,
      oneOf: [
        object({ mode: { type: 'string', enum: ['included'] } }),
        object({ mode: { type: 'string', enum: ['separate'] }, monthlyChargePaisa: money }),
      ],
    },
  },
  ['offer'],
);
const subscription = contractObject('transportSubscriptionSchema');
const subscriptionPage = contractObject('transportSubscriptionPageSchema');
const menuBody = object(
  {
    expectedVersion: { type: 'integer', minimum: 0 },
    items: {
      type: 'array',
      maxItems: 21,
      items: object({
        dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 },
        meal: { type: 'string', enum: mealSchema.options },
        description: { type: 'string', maxLength: 200 },
      }),
    },
    times: {
      type: 'array',
      maxItems: 21,
      items: object({
        dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 },
        meal: { type: 'string', enum: mealSchema.options },
        startsAt: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
        endsAt: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      }),
    },
    // CHG-037: omitted times keep the current meal times.
  },
  ['times'],
);
const pricingModes: string[] = ['separate', 'included'];
const routeFields = {
  name: { type: 'string', maxLength: 120 },
  description: { type: 'string', maxLength: 500 },
  monthlyChargePaisa: money,
  departureTimes: {
    type: 'array',
    maxItems: 12,
    items: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
  },
  stops: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 120 } },
  // CHG-042: pricing mode, typed destinations, stop roles and weekly trips.
  pricingMode: { type: 'string', enum: pricingModes },
  includedFrom: { type: 'string', format: 'date', nullable: true },
  destinations: {
    type: 'array',
    maxItems: 20,
    items: { type: 'object', additionalProperties: true },
  },
  stopPoints: {
    type: 'array',
    maxItems: 30,
    items: { type: 'object', additionalProperties: true },
  },
  trips: { type: 'array', maxItems: 24, items: { type: 'object', additionalProperties: true } },
} as const;
const optionalRouteFields = [
  'description',
  'monthlyChargePaisa',
  'departureTimes',
  'stops',
  'pricingMode',
  'includedFrom',
  'destinations',
  'stopPoints',
  'trips',
];
@ApiTags('Phase 9 resident services')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@AuthProblems()
@Controller()
export class ResidentServicesController {
  constructor(@Inject(RESIDENT_SERVICES) private readonly services: ResidentServices) {}
  @Get('public/branches/:branchId/menu')
  @Public()
  @ApiOperation({ operationId: 'publicBranchMenu', summary: 'SERV-001: published weekly menu' })
  @ApiResponse({ status: 200, schema: menu })
  publicMenu(@Param('branchId', idPipe) branchId: string) {
    return this.services.menu.publicRead(branchId);
  }
  @Get('public/branches/:branchId/transport/routes')
  @Public()
  @ApiOperation({
    operationId: 'publicTransportRoutes',
    summary: 'SERV-002: published routes and branch billing offer',
  })
  @ApiResponse({ status: 200, schema: routeList })
  publicRoutes(@Param('branchId', idPipe) branchId: string) {
    return this.services.routes.publicList(branchId);
  }
  @Get('me/stays/:stayId/menu')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'stayMenu',
    summary: 'SERV-001: the active Stay branch menu (read-only)',
  })
  @ApiResponse({ status: 200, schema: menu })
  ownMenu(@Req() request: FastifyRequest, @Param('stayId', idPipe) stayId: string) {
    return this.services.menu.ownRead(actorOf(request), stayId);
  }
  @Get('me/stays/:stayId/transport/routes')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'stayTransportRoutes',
    summary: 'SERV-002: routes the resident may join',
  })
  @ApiResponse({ status: 200, schema: routeList })
  ownRoutes(@Req() request: FastifyRequest, @Param('stayId', idPipe) stayId: string) {
    return this.services.routes.ownList(actorOf(request), stayId);
  }
  @Get('me/stays/:stayId/transport/subscriptions')
  @Self()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'stayTransportSubscriptions',
    summary: 'SERV-002: own requests and subscriptions',
  })
  @ApiResponse({ status: 200, schema: subscriptionPage })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  ownSubscriptions(
    @Req() request: FastifyRequest,
    @Param('stayId', idPipe) stayId: string,
    @Query() query: unknown,
  ) {
    return this.services.subscriptions.ownList(actorOf(request), stayId, query);
  }
  @Post('me/stays/:stayId/transport/subscriptions')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'requestTransport',
    summary: 'p.32: ask to join a route at the price shown',
  })
  @ApiBody({ schema: object({ routeId: identifier, monthlyChargePaisa: money }, ['routeId']) })
  @ApiResponse({ status: 201, schema: subscription })
  async request(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.subscriptions.request(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        body,
      ),
    );
  }
  @Post('me/stays/:stayId/transport/subscriptions/:subscriptionId/withdraw')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'transportWithdraw', summary: 'p.32: withdraw a pending request' })
  @ApiBody({ schema: object({ expectedVersion: version }) })
  @ApiResponse({ status: 200, schema: subscription })
  async residentWithdraw(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Param('subscriptionId', idPipe) subscriptionId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.subscriptions.resident(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        subscriptionId,
        'withdraw',
        body,
      ),
    );
  }
  @Post('me/stays/:stayId/transport/subscriptions/:subscriptionId/end')
  @Self()
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'transportEnd', summary: 'p.32: ask the hostel to end transport' })
  @ApiBody({ schema: object({ expectedVersion: version }) })
  @ApiResponse({ status: 200, schema: subscription })
  async residentEnd(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('stayId', idPipe) stayId: string,
    @Param('subscriptionId', idPipe) subscriptionId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.subscriptions.resident(
        actorOf(request),
        request.headers['idempotency-key'],
        stayId,
        subscriptionId,
        'end',
        body,
      ),
    );
  }
  @Get('branches/:branchId/menu')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'branchMenu', summary: 'SERV-001: staff view of the weekly menu' })
  @ApiResponse({ status: 200, schema: menu })
  staffMenu(@Req() request: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.services.menu.staffRead(actorOf(request), branchId);
  }
  @Put('branches/:branchId/menu')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'updateBranchMenu',
    summary: 'SERV-001: replace the week (listing_edit; expected version)',
  })
  @ApiBody({ schema: menuBody })
  @ApiResponse({ status: 200, schema: menu })
  async updateMenu(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.menu.update(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        body,
      ),
    );
  }
  @Get('branches/:branchId/transport/routes')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchTransportRoutes',
    summary: 'SERV-002: all routes, active and inactive',
  })
  @ApiResponse({ status: 200, schema: routeList })
  staffRoutes(@Req() request: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.services.routes.staffList(actorOf(request), branchId);
  }
  @Get('branches/:branchId/transport/overview')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'branchTransportOverview',
    summary: 'CHG-042: live transport counts for the branch',
  })
  @ApiResponse({ status: 200, schema: contractObject('transportOverviewSchema') })
  transportOverview(@Req() request: FastifyRequest, @Param('branchId', idPipe) branchId: string) {
    return this.services.routes.overview(actorOf(request), branchId);
  }
  @Post('branches/:branchId/transport/routes')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'createTransportRoute',
    summary: 'SERV-002: new route (listing_edit + pricing_edit)',
  })
  @ApiBody({
    schema: object({ ...routeFields, status: { type: 'string', enum: ['active', 'inactive'] } }, [
      ...optionalRouteFields,
      'status',
    ]),
  })
  @ApiResponse({ status: 201, schema: route })
  async createRoute(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.routes.create(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        body,
      ),
    );
  }
  @Put('branches/:branchId/transport/routes/:routeId')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'updateTransportRoute',
    summary: 'SERV-002: edit or retire a route (riders first)',
  })
  @ApiBody({
    schema: object(
      {
        ...routeFields,
        expectedVersion: version,
        status: { type: 'string', enum: ['active', 'inactive'] },
      },
      optionalRouteFields,
    ),
  })
  @ApiResponse({ status: 200, schema: route })
  async updateRoute(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('routeId', idPipe) routeId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.routes.update(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        routeId,
        body,
      ),
    );
  }
  @Get('branches/:branchId/transport/subscriptions')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'status', required: false, enum: transportSubscriptionStatusSchema.options })
  @ApiQuery({ name: 'stayId', required: false, schema: identifier })
  @ApiQuery({ name: 'cursor', required: false, schema: identifier })
  @ApiQuery({
    name: 'limit',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 50 },
  })
  @ApiOperation({
    operationId: 'branchTransportSubscriptions',
    summary: 'p.38: requests and riders',
  })
  @ApiResponse({ status: 200, schema: subscriptionPage })
  staffSubscriptions(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.services.subscriptions.staffList(actorOf(request), branchId, query);
  }
  @Post('branches/:branchId/transport/subscriptions/:subscriptionId/decision')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'decideTransport',
    summary:
      'p.32: approve (effectiveFrom), reject (reason) or end (effectiveTo); stay_manage + rent_manage',
  })
  @ApiBody({
    schema: {
      oneOf: [
        object({
          decision: { type: 'string', enum: ['approve'] },
          expectedVersion: version,
          effectiveFrom: date,
        }),
        object({
          decision: { type: 'string', enum: ['reject'] },
          expectedVersion: version,
          reason: { type: 'string', maxLength: 500 },
        }),
        object({
          decision: { type: 'string', enum: ['end'] },
          expectedVersion: version,
          effectiveTo: date,
        }),
      ],
    },
  })
  @ApiResponse({ status: 200, schema: subscription })
  async decide(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('subscriptionId', idPipe) subscriptionId: string,
    @Body() body: unknown,
  ) {
    return replay(
      reply,
      await this.services.subscriptions.decide(
        actorOf(request),
        request.headers['idempotency-key'],
        branchId,
        subscriptionId,
        body,
      ),
    );
  }
}

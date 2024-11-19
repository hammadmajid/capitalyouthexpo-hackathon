import {
  transportDecisionInputSchema,
  transportRequestInputSchema,
  transportResidentActionSchema,
  transportRouteInputSchema,
  transportOverviewSchema,
  transportRouteListSchema,
  transportRouteSchema,
  transportRouteUpdateSchema,
  transportSubscriptionPageSchema,
  transportSubscriptionQuerySchema,
  transportSubscriptionSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
import { bound, header, id, ownStay, withoutUndefined } from './resident-service-scope.js';
// SERV-002: routes and subscriptions.
export async function readPublicRoutes(client: ApiClient, branch: unknown) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.GET('/v1/public/branches/{branchId}/transport/routes', {
        params: { path: { branchId } },
      }),
      transportRouteListSchema,
    ),
    branchId,
  );
}
export async function readStayRoutes(client: ApiClient, stay: unknown) {
  return readApi(
    client.GET('/v1/me/stays/{stayId}/transport/routes', {
      params: { path: { stayId: id(stay) } },
    }),
    transportRouteListSchema,
  );
}
export async function readBranchRoutes(client: ApiClient, branch: unknown) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.GET('/v1/branches/{branchId}/transport/routes', { params: { path: { branchId } } }),
      transportRouteListSchema,
    ),
    branchId,
  );
}
// CHG-042: live counts for the Transport home (routes, destinations, riders, trips today).
export async function readTransportOverview(client: ApiClient, branch: unknown) {
  const branchId = id(branch);
  const overview = await readApi(
    client.GET('/v1/branches/{branchId}/transport/overview', { params: { path: { branchId } } }),
    transportOverviewSchema,
  );
  if (overview.branchId !== branchId) throw new ClientFailure('INVALID_RESPONSE');
  return overview;
}
export async function createTransportRoute(
  client: ApiClient,
  branch: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.POST('/v1/branches/{branchId}/transport/routes', {
        params: { path: { branchId }, header: header(key) },
        body: withoutUndefined(transportRouteInputSchema.parse(input)),
      }),
      transportRouteSchema,
    ),
    branchId,
  );
}
export async function updateTransportRoute(
  client: ApiClient,
  branch: unknown,
  route: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.PUT('/v1/branches/{branchId}/transport/routes/{routeId}', {
        params: { path: { branchId, routeId: id(route) }, header: header(key) },
        body: withoutUndefined(transportRouteUpdateSchema.parse(input)),
      }),
      transportRouteSchema,
    ),
    branchId,
  );
}
export async function readStayTransport(client: ApiClient, stay: unknown, query: unknown = {}) {
  const stayId = id(stay);
  const input = transportSubscriptionQuerySchema.omit({ status: true, stayId: true }).parse(query);
  const page = await readApi(
    client.GET('/v1/me/stays/{stayId}/transport/subscriptions', {
      params: {
        path: { stayId },
        query: {
          ...(input.limit === 20 ? {} : { limit: input.limit }),
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
      },
    }),
    transportSubscriptionPageSchema,
  );
  page.data.forEach((row) => ownStay(row, stayId));
  return page;
}
export async function requestTransport(
  client: ApiClient,
  stay: unknown,
  input: unknown,
  key: string,
) {
  const stayId = id(stay);
  return ownStay(
    await readApi(
      client.POST('/v1/me/stays/{stayId}/transport/subscriptions', {
        params: { path: { stayId }, header: header(key) },
        body: withoutUndefined(transportRequestInputSchema.parse(input)),
      }),
      transportSubscriptionSchema,
    ),
    stayId,
  );
}
export async function residentTransportAction(
  client: ApiClient,
  stay: unknown,
  subscription: unknown,
  act: 'withdraw' | 'end',
  input: unknown,
  key: string,
) {
  const stayId = id(stay),
    options = {
      params: { path: { stayId, subscriptionId: id(subscription) }, header: header(key) },
      body: transportResidentActionSchema.parse(input),
    };
  const response =
    act === 'withdraw'
      ? client.POST(
          '/v1/me/stays/{stayId}/transport/subscriptions/{subscriptionId}/withdraw',
          options,
        )
      : client.POST('/v1/me/stays/{stayId}/transport/subscriptions/{subscriptionId}/end', options);
  return ownStay(await readApi(response, transportSubscriptionSchema), stayId);
}
export async function readBranchTransport(client: ApiClient, branch: unknown, query: unknown = {}) {
  const input = transportSubscriptionQuerySchema.parse(query);
  return readApi(
    client.GET('/v1/branches/{branchId}/transport/subscriptions', {
      params: {
        path: { branchId: id(branch) },
        query: {
          limit: input.limit,
          ...(input.status ? { status: input.status } : {}),
          ...(input.stayId ? { stayId: input.stayId } : {}),
          ...(input.cursor ? { cursor: input.cursor } : {}),
        },
      },
    }),
    transportSubscriptionPageSchema,
  );
}
export async function decideTransport(
  client: ApiClient,
  branch: unknown,
  subscription: unknown,
  input: unknown,
  key: string,
) {
  const branchId = id(branch);
  return bound(
    await readApi(
      client.POST('/v1/branches/{branchId}/transport/subscriptions/{subscriptionId}/decision', {
        params: { path: { branchId, subscriptionId: id(subscription) }, header: header(key) },
        body: transportDecisionInputSchema.parse(input),
      }),
      transportSubscriptionSchema,
    ),
    branchId,
  );
}

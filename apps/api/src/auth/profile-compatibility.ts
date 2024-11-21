import type { FastifyInstance } from 'fastify';
import { PROFILE_REVIEWS_HEADER } from '@hsm/contracts';
// Legacy strict clients must not receive additive profile fields without opting in.
// This is response-shape negotiation; the ordinary authentication/role guards remain required.
export function installProfileCompatibility(server: FastifyInstance) {
  server.addHook('preSerialization', async (request, _reply, payload) => {
    if (
      request.headers[PROFILE_REVIEWS_HEADER] === '1' ||
      !payload ||
      typeof payload !== 'object' ||
      !('features' in payload) ||
      !('user' in payload) ||
      !('capabilities' in payload)
    )
      return payload;
    const { features, ...legacy } = payload;
    void features;
    return legacy;
  });
}

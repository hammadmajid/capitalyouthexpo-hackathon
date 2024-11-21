import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { INFRASTRUCTURE, type Infrastructure } from './infrastructure.js';
import { Public } from './access.js';

export const readinessSchema = z
  .object({
    status: z.enum(['ready', 'unavailable']),
    dependencies: z.object({ postgres: z.boolean(), redis: z.boolean() }).strict(),
  })
  .strict();
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(INFRASTRUCTURE) private readonly infrastructure: Infrastructure) {}
  @Public()
  @Get('live')
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: ['alive'] } },
      required: ['status'],
    },
  })
  live() {
    return { status: 'alive' as const };
  }
  @Public()
  @Get('ready')
  @ApiResponse({ status: 200, description: 'Required PostgreSQL and Redis dependencies are ready' })
  @ApiResponse({ status: 503, description: 'A required dependency is unavailable' })
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    const results = await Promise.allSettled([
      this.infrastructure.postgres(),
      this.infrastructure.redis(),
    ]);
    const dependencies = {
      postgres: results[0].status === 'fulfilled',
      redis: results[1].status === 'fulfilled',
    };
    const available = dependencies.postgres && dependencies.redis;
    reply.status(available ? 200 : 503);
    return readinessSchema.parse({ status: available ? 'ready' : 'unavailable', dependencies });
  }
}

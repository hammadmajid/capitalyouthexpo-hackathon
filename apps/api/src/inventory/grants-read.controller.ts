import { Controller, Get, Inject, Param, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { inventoryPermissionSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object } from './documentation.js';
import { InventoryGrantReadService } from './grants-read.service.js';
export const INVENTORY_GRANT_READ_SERVICE = Symbol('InventoryGrantReadService');
@BranchScope('branchId', true)
@AuthProblems()
@ApiTags('Branch Manager permissions')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/managers/:assignmentId/inventory-permissions')
export class InventoryGrantReadController {
  constructor(
    @Inject(INVENTORY_GRANT_READ_SERVICE) private readonly service: InventoryGrantReadService,
  ) {}
  @Get()
  @ApiOperation({
    summary:
      'ACC-004: Owner reads actual assignment grants; no grant overrides CHG-008 document privacy',
  })
  @ApiResponse({
    status: 200,
    schema: object({
      branchId: { type: 'string', format: 'uuid' },
      assignmentId: { type: 'string', format: 'uuid' },
      permissions: {
        type: 'array',
        maxItems: inventoryPermissionSchema.options.length,
        uniqueItems: true,
        items: { type: 'string', enum: [...inventoryPermissionSchema.options] },
      },
    }),
  })
  async read(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Param('assignmentId', zodPipe(z.string().uuid())) assignmentId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), branchId, assignmentId, query);
  }
}

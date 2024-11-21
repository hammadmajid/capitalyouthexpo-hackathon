import { Body, Controller, Inject, Param, Put, Req, Res } from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { managerInventoryGrantInputSchema, inventoryPermissionSchema } from '@hsm/contracts';
import { BranchScope, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { object, mutationDocumentation } from './documentation.js';
import { InventoryGrantService } from './grants.service.js';
export const INVENTORY_GRANT_SERVICE = Symbol('InventoryGrantService');
@BranchScope('branchId', true)
@AuthProblems()
@ApiTags('Branch Manager permissions')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('branches/:branchId/managers/:assignmentId/inventory-permissions')
export class InventoryGrantController {
  constructor(@Inject(INVENTORY_GRANT_SERVICE) private readonly service: InventoryGrantService) {}
  @Put()
  @CookieCsrf()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  })
  @ApiBody({
    schema: object({
      permissions: {
        type: 'array',
        maxItems: inventoryPermissionSchema.options.length,
        uniqueItems: true,
        items: { type: 'string', enum: [...inventoryPermissionSchema.options] },
      },
    }),
  })
  @ApiResponse({ status: 200, schema: mutationDocumentation })
  @ApiOperation({
    summary:
      'ACC-004 / CHG-008: Owner controls Manager permissions; before confirmation Managers see document status only',
  })
  async save(
    @Req() request: FastifyRequest,
    @Param('branchId', zodPipe(z.string().uuid())) branchId: string,
    @Param('assignmentId', zodPipe(z.string().uuid())) assignmentId: string,
    @Body(zodPipe(managerInventoryGrantInputSchema)) body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.service.save(
      actorOf(request),
      z.string().uuid().parse(request.headers['idempotency-key']),
      branchId,
      assignmentId,
      body,
    );
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

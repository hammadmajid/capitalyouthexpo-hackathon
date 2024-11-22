import { Body, Controller, Get, Inject, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
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
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject, idPipe, idempotencyHeader, replay } from '../services/http.js';
import { PropertyStructureService } from './property-structure.service.js';
import {
  propertyArchiveInputDocumentation,
  propertyBuildingInputDocumentation,
  propertyFloorInputDocumentation,
  propertyLocationInputDocumentation,
  propertyPageQueries,
} from './property-structure.documentation.js';
export const PROPERTY_STRUCTURE = Symbol('PropertyStructure');
@BranchScope('branchId')
@AuthProblems()
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@ApiTags('Property hierarchy / AUD-010')
@Controller('branches/:branchId/property')
export class PropertyStructureController {
  constructor(@Inject(PROPERTY_STRUCTURE) private readonly service: PropertyStructureService) {}
  @Get('buildings')
  @ApiOperation({
    operationId: 'propertyBuildings',
    summary: 'PROP / RPT-001: bounded branch building metadata',
  })
  @ApiQuery(propertyPageQueries[0])
  @ApiQuery(propertyPageQueries[1])
  @ApiQuery(propertyPageQueries[2])
  @ApiQuery(propertyPageQueries[4])
  // eslint-disable-next-line no-secrets/no-secrets -- Public OpenAPI contract name, not a credential.
  @ApiResponse({ status: 200, schema: contractObject('propertyBuildingPageSchema') })
  async buildings(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.buildings(actorOf(req), branch, query);
  }
  @Get('floors')
  @ApiOperation({
    operationId: 'propertyFloors',
    summary: 'PROP / RPT-001: bounded floors under an exact branch building',
  })
  @ApiQuery(propertyPageQueries[0])
  @ApiQuery(propertyPageQueries[1])
  @ApiQuery(propertyPageQueries[2])
  @ApiQuery({ ...propertyPageQueries[3], required: true })
  @ApiQuery(propertyPageQueries[4])
  @ApiResponse({ status: 200, schema: contractObject('propertyFloorPageSchema') })
  async floors(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.floors(actorOf(req), branch, query);
  }
  @Get('rooms/:roomId/location')
  @ApiOperation({
    operationId: 'propertyRoomLocation',
    summary: 'PROP / RPT-001: authoritative room location and edit authority',
  })
  @ApiResponse({ status: 200, schema: contractObject('propertyRoomLocationSchema') })
  async room(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Param('roomId', idPipe) room: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.room(actorOf(req), branch, room, query);
  }
  @Post('buildings')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'createPropertyBuilding',
    summary: 'PROP / AUD-010: create an audited branch building with inventory_edit',
  })
  @ApiBody({ schema: propertyBuildingInputDocumentation })
  // eslint-disable-next-line no-secrets/no-secrets -- Public OpenAPI contract name, not a credential.
  @ApiResponse({ status: 201, schema: contractObject('propertyBuildingSchema') })
  async createBuilding(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return replay(
      reply,
      await this.service.createBuilding(
        actorOf(req),
        String(req.headers['idempotency-key'] ?? ''),
        branch,
        body,
      ),
    );
  }
  @Post('floors')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'createPropertyFloor',
    summary: 'PROP / AUD-010: create an audited floor in the exact branch building',
  })
  @ApiBody({ schema: propertyFloorInputDocumentation })
  @ApiResponse({ status: 201, schema: contractObject('propertyFloorSchema') })
  async createFloor(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return replay(
      reply,
      await this.service.createFloor(
        actorOf(req),
        String(req.headers['idempotency-key'] ?? ''),
        branch,
        body,
      ),
    );
  }
  @Post('buildings/:buildingId/archive')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'archiveBuilding',
    summary: 'PROP / AUD-010: archive a versioned building without deleting references',
  })
  @ApiBody({ schema: propertyArchiveInputDocumentation })
  // eslint-disable-next-line no-secrets/no-secrets -- Public OpenAPI contract name, not a credential.
  @ApiResponse({ status: 200, schema: contractObject('propertyBuildingSchema') })
  async archiveBuilding(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Param('buildingId', idPipe) building: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return replay(
      reply,
      await this.service.archiveBuilding(
        actorOf(req),
        String(req.headers['idempotency-key'] ?? ''),
        branch,
        building,
        body,
      ),
    );
  }
  @Post('floors/:floorId/archive')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'archivePropertyFloor',
    summary: 'PROP / AUD-010: archive a versioned floor without deleting references',
  })
  @ApiBody({ schema: propertyArchiveInputDocumentation })
  @ApiResponse({ status: 200, schema: contractObject('propertyFloorSchema') })
  async archiveFloor(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Param('floorId', idPipe) floor: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return replay(
      reply,
      await this.service.archiveFloor(
        actorOf(req),
        String(req.headers['idempotency-key'] ?? ''),
        branch,
        floor,
        body,
      ),
    );
  }
  @Put('rooms/:roomId/location')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'savePropertyRoomLocation',
    summary: 'PROP / AUD-010: versioned, audited room location metadata correction',
  })
  @ApiBody({ schema: propertyLocationInputDocumentation })
  @ApiResponse({ status: 200, schema: contractObject('propertyRoomLocationSchema') })
  async saveRoom(
    @Req() req: FastifyRequest,
    @Param('branchId', idPipe) branch: string,
    @Param('roomId', idPipe) room: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return replay(
      reply,
      await this.service.saveRoom(
        actorOf(req),
        String(req.headers['idempotency-key'] ?? ''),
        branch,
        room,
        body,
      ),
    );
  }
}

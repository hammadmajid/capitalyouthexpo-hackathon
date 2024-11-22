import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  hostelRevisionCommandSchema,
  saveHostelRevisionSchema,
  type SaveHostelRevision,
} from '@hsm/contracts';
import { Owner, actorOf } from '../access.js';
import { zodPipe } from '../problem.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import type { HostelRevisionService } from './hostel-revision.service.js';
import {
  revisionCommandDocumentation,
  revisionSaveDocumentation,
  revisionStateDocumentation,
} from './hostel-revision.documentation.js';
export const HOSTEL_REVISION_SERVICE = Symbol('HostelRevisionService');
const identifier = z.string().uuid(),
  idPipe = zodPipe(identifier);
type Command = z.infer<typeof hostelRevisionCommandSchema>;
const key = { name: 'Idempotency-Key', required: true, schema: { type: 'string', format: 'uuid' } };
// CHG-041: an approved hostel stays live while its edited basics/location wait for HSM review.
@Owner()
@AuthProblems()
@ApiTags('Owner hostel re-verification')
@ApiSecurity('bearer')
@ApiSecurity('cookie')
@Controller('owner/brands/:brandId/revision')
export class HostelRevisionController {
  constructor(@Inject(HOSTEL_REVISION_SERVICE) private readonly service: HostelRevisionService) {}
  @Get()
  @ApiResponse({ status: 200, schema: revisionStateDocumentation })
  @ApiOperation({ summary: 'CHG-041: live hostel and its latest pending or decided changes' })
  async read(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
  ) {
    reply.header('Cache-Control', 'no-store');
    return this.service.read(actorOf(request), brandId);
  }
  @Put()
  @CookieCsrf()
  @ApiHeader(key)
  @ApiBody({ schema: revisionSaveDocumentation })
  @ApiResponse({ status: 200, schema: revisionStateDocumentation })
  @ApiOperation({ summary: 'CHG-041: save edits as unsent changes; the live listing is unchanged' })
  save(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(saveHostelRevisionSchema)) input: SaveHostelRevision,
  ) {
    return this.respond(
      reply,
      this.service.save(actorOf(request), this.key(request), brandId, input),
    );
  }
  @Post('submit')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader(key)
  @ApiBody({ schema: revisionCommandDocumentation })
  @ApiResponse({ status: 200, schema: revisionStateDocumentation })
  @ApiOperation({ summary: 'CHG-041: send the changes for HSM re-verification' })
  submit(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(hostelRevisionCommandSchema)) input: Command,
  ) {
    return this.respond(
      reply,
      this.service.submit(actorOf(request), this.key(request), brandId, input),
    );
  }
  @Post('withdraw')
  @HttpCode(200)
  @CookieCsrf()
  @ApiHeader(key)
  @ApiBody({ schema: revisionCommandDocumentation })
  @ApiResponse({ status: 200, schema: revisionStateDocumentation })
  @ApiOperation({ summary: 'CHG-041: discard unsent or waiting changes; the live listing stays' })
  withdraw(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('brandId', idPipe) brandId: string,
    @Body(zodPipe(hostelRevisionCommandSchema)) input: Command,
  ) {
    return this.respond(
      reply,
      this.service.withdraw(actorOf(request), this.key(request), brandId, input),
    );
  }
  private key(request: FastifyRequest) {
    return identifier.parse(request.headers['idempotency-key']);
  }
  private async respond(reply: FastifyReply, response: ReturnType<HostelRevisionService['save']>) {
    const result = await response;
    reply
      .code(result.status)
      .header('Idempotency-Replayed', String(result.replayed))
      .header('Cache-Control', 'no-store');
    return result.body;
  }
}

import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { BranchScope, actorOf } from '../access.js';
import { AuthProblems } from '../auth/problem.documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
import { contractObject, idPipe, idempotencyHeader, replay } from '../services/http.js';
import type { StaffService } from './staff.service.js';
import type { StaffPayrollService } from './staff-payroll.service.js';
export const STAFF_SERVICES = Symbol('StaffServices');
export type StaffServices = { staff: StaffService; payroll: StaffPayrollService };
const member = contractObject('staffMemberSchema');
const salary = contractObject('staffSalarySchema');
type Command = (
  services: StaffServices,
  request: FastifyRequest,
  key: unknown,
  branchId: string,
  target: string,
  body: unknown,
) => Promise<{ status: number; replayed: boolean; body: unknown }>;
// CHG-039: branch staff and record-only salary tracking. Every route is branch-scoped; grants
// (staff_manage / staff_payroll_manage) are rechecked inside each service transaction.
@AuthProblems()
@Controller()
export class StaffController {
  constructor(@Inject(STAFF_SERVICES) private readonly services: StaffServices) {}
  private async run(
    request: FastifyRequest,
    reply: FastifyReply,
    branchId: string,
    target: string,
    body: unknown,
    command: Command,
  ) {
    return replay(
      reply,
      await command(
        this.services,
        request,
        request.headers['idempotency-key'],
        branchId,
        target,
        body,
      ),
    );
  }
  @Get('branches/:branchId/staff')
  @ApiQuery({ name: 'salary', required: false, schema: { type: 'string', enum: ['due'] } })
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listStaff', summary: 'CHG-039: branch staff directory' })
  @ApiResponse({ status: 200, schema: contractObject('staffPageSchema') })
  list(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.services.staff.list(actorOf(request), branchId, query);
  }
  @Get('branches/:branchId/staff-dashboard')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'staffDashboard', summary: 'CHG-039: staff and salary summary' })
  @ApiResponse({ status: 200, schema: contractObject('staffDashboardSchema') })
  dashboard(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Query() query: unknown,
  ) {
    return this.services.staff.dashboard(actorOf(request), branchId, query);
  }
  @Get('branches/:branchId/staff/:staffId')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'readStaff', summary: 'CHG-039: staff detail and history' })
  @ApiResponse({ status: 200, schema: contractObject('staffDetailSchema') })
  detail(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('staffId', idPipe) staffId: string,
  ) {
    return this.services.staff.detail(actorOf(request), branchId, staffId);
  }
  @Post('branches/:branchId/staff')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'createStaff', summary: 'CHG-039: add staff (staff_manage)' })
  @ApiBody({ schema: contractObject('staffCreateInputSchema') })
  @ApiResponse({ status: 201, schema: member })
  create(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, '', body, (s, r, k, b, _t, input) =>
      s.staff.create(actorOf(r), k, b, input),
    );
  }
  @Patch('branches/:branchId/staff/:staffId')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'updateStaff', summary: 'CHG-039: edit staff (expected version)' })
  @ApiBody({ schema: contractObject('staffUpdateInputSchema') })
  @ApiResponse({ status: 200, schema: member })
  update(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('staffId', idPipe) staffId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, staffId, body, (s, r, k, b, t, input) =>
      s.staff.update(actorOf(r), k, b, t, input),
    );
  }
  @Post('branches/:branchId/staff/:staffId/status')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'setStaffStatus',
    summary: 'CHG-039: deactivate or end; history kept',
  })
  @ApiBody({ schema: contractObject('staffStatusInputSchema') })
  @ApiResponse({ status: 200, schema: member })
  status(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('staffId', idPipe) staffId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, staffId, body, (s, r, k, b, t, input) =>
      s.staff.setStatus(actorOf(r), k, b, t, input),
    );
  }
  @Post('branches/:branchId/staff/:staffId/salary-terms')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'setStaffSalaryTerms', summary: 'CHG-039: new salary version' })
  @ApiBody({ schema: contractObject('staffSalaryTermsInputSchema') })
  @ApiResponse({ status: 200, schema: contractObject('staffTermsSchema') })
  terms(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('staffId', idPipe) staffId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, staffId, body, (s, r, k, b, t, input) =>
      s.payroll.setTerms(actorOf(r), k, b, t, input),
    );
  }
  @Post('branches/:branchId/staff/:staffId/salaries')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'issueStaffSalary',
    summary: 'CHG-039: explicit amount for a partly worked month',
  })
  @ApiBody({ schema: contractObject('staffIssueInputSchema') })
  @ApiResponse({ status: 200, schema: salary })
  issue(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('staffId', idPipe) staffId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, staffId, body, (s, r, k, b, t, input) =>
      s.payroll.issue(actorOf(r), k, b, t, input),
    );
  }
  @Post('branches/:branchId/staff-salaries/:salaryId/payments')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({
    operationId: 'recordStaffSalaryPayment',
    summary: 'CHG-039: record an external salary payment (no transfer)',
  })
  @ApiBody({ schema: contractObject('staffPaymentInputSchema') })
  @ApiResponse({ status: 200, schema: salary })
  pay(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('salaryId', idPipe) salaryId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, salaryId, body, (s, r, k, b, t, input) =>
      s.payroll.pay(actorOf(r), k, b, t, input),
    );
  }
  @Post('branches/:branchId/staff-payments/:paymentId/reversal')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'reverseStaffSalaryPayment', summary: 'CHG-039: audited reversal' })
  @ApiBody({ schema: contractObject('staffReversalInputSchema') })
  @ApiResponse({ status: 200, schema: salary })
  reverse(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('paymentId', idPipe) paymentId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, paymentId, body, (s, r, k, b, t, input) =>
      s.payroll.reverse(actorOf(r), k, b, t, input),
    );
  }
  @Post('branches/:branchId/staff/:staffId/agreements')
  @BranchScope('branchId')
  @CookieCsrf()
  @ApiHeader(idempotencyHeader)
  @ApiOperation({ operationId: 'createStaffAgreement', summary: 'CHG-039: new agreement version' })
  @ApiBody({ schema: contractObject('staffAgreementInputSchema') })
  @ApiResponse({ status: 200, schema: contractObject('staffAgreementSchema') })
  agreement(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Param('branchId', idPipe) branchId: string,
    @Param('staffId', idPipe) staffId: string,
    @Body() body: unknown,
  ) {
    return this.run(request, reply, branchId, staffId, body, (s, r, k, b, t, input) =>
      s.payroll.agreement(actorOf(r), k, b, t, input),
    );
  }
  @Get('branches/:branchId/staff-agreements/:agreementId/file')
  @BranchScope('branchId')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'staffAgreementFile',
    summary: 'CHG-039: short-lived private agreement download (audited)',
  })
  @ApiResponse({ status: 200, schema: contractObject('staffAgreementFileSchema') })
  file(
    @Req() request: FastifyRequest,
    @Param('branchId', idPipe) branchId: string,
    @Param('agreementId', idPipe) agreementId: string,
  ) {
    return this.services.payroll.agreementFile(actorOf(request), branchId, agreementId);
  }
}

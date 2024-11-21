import { reportUnexpectedFailure } from './observability/reporter.js';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { DomainError, type ErrorCode } from '@hsm/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError, type ZodType } from 'zod';

const publicCodes = new Set<ErrorCode>([
  'VALIDATION_FAILED',
  'CONFLICT',
  'PRECONDITION_FAILED',
  'UNDERAGE',
  'ROOT_ADMIN_LIMIT',
  'IMPORT_ALREADY_COMMITTED',
]);
export function problem(error: unknown, request: Pick<FastifyRequest, 'id'>) {
  const status =
    error instanceof DomainError
      ? error.status
      : error instanceof ZodError
        ? 400
        : error instanceof HttpException
          ? error.getStatus()
          : typeof error === 'object' &&
              error !== null &&
              'statusCode' in error &&
              typeof error.statusCode === 'number'
            ? error.statusCode
            : 500;
  const code: ErrorCode =
    error instanceof DomainError
      ? error.code
      : error instanceof ZodError
        ? 'VALIDATION_FAILED'
        : status === 404
          ? 'NOT_FOUND'
          : status === 403
            ? 'FORBIDDEN'
            : status === 429
              ? 'RATE_LIMITED'
              : status < 500
                ? 'VALIDATION_FAILED'
                : 'INTERNAL';
  const title = code === 'INTERNAL' ? 'An unexpected error occurred' : code.replaceAll('_', ' ');
  return {
    type: 'urn:hsm:error:' + code.toLowerCase(),
    title,
    status,
    code,
    // CHG-038 / SEC-003: only input and editing problems carry their fixed, developer-written
    // sentence so the app can say exactly what to fix. Identity, account, permission and
    // unexpected errors keep the generic title.
    detail: error instanceof DomainError && publicCodes.has(error.code) ? error.message : title,
    traceId: String(request.id),
    ...(error instanceof ZodError
      ? {
          errors: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            code: issue.code,
            message: 'Invalid value',
          })),
        }
      : error instanceof DomainError && error.field
        ? { errors: [{ path: error.field, code: error.code.toLowerCase(), message: title }] }
        : {}),
  };
}
@Catch()
export class ProblemFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<FastifyRequest>();
    const reply = context.getResponse<FastifyReply>();
    const response = problem(error, request);
    if (response.status >= 500) {
      request.log.error({ code: response.code, requestId: request.id }, 'Request failed');
      reportUnexpectedFailure();
    }
    reply.header('x-request-id', request.id);
    void reply.status(response.status).type('application/problem+json').send(response);
  }
}
export function zodPipe<T>(schema: ZodType<T>) {
  return { transform: (value: unknown) => schema.parse(value) };
}

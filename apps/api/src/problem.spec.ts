import { HttpException } from '@nestjs/common';
import { DomainError, problemSchema } from '@hsm/contracts';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { problem, zodPipe } from './problem.js';
const request = { id: 'request-123' };
it.each([
  [new Error('private SQL password'), 500, 'INTERNAL'],
  [null, 500, 'INTERNAL'],
  ['private SQL', 500, 'INTERNAL'],
  [new HttpException('private message', 400), 400, 'VALIDATION_FAILED'],
  [new HttpException('private message', 403), 403, 'FORBIDDEN'],
  [new HttpException('private message', 404), 404, 'NOT_FOUND'],
  [new HttpException('private message', 429), 429, 'RATE_LIMITED'],
  [{ statusCode: 413, message: 'private payload' }, 413, 'VALIDATION_FAILED'],
  [new DomainError('ACCOUNT_SUSPENDED', 403, 'private identity'), 403, 'ACCOUNT_SUSPENDED'],
] as const)(
  'SEC-003: sanitizes transport errors to stable contracts (%s)',
  (error, status, code) => {
    const response = problem(error, request);
    expect(problemSchema.parse(response)).toMatchObject({ status, code, traceId: 'request-123' });
    expect(JSON.stringify(response)).not.toContain('private');
  },
);
it('SEC-001: reusable Zod pipes validate strict params, query and body boundaries', () => {
  const pipe = zodPipe(z.object({ id: z.string().uuid() }).strict());
  const invalid = z.object({ id: z.string().uuid() }).safeParse({ id: 'not-a-uuid' });
  if (invalid.success) throw new Error('Expected failed validation');
  expect(problem(invalid.error, request)).toMatchObject({
    status: 400,
    code: 'VALIDATION_FAILED',
    errors: [{ path: 'id', code: 'invalid_string', message: 'Invalid value' }],
  });
  expect(() => pipe.transform({ id: 'invalid' })).toThrow();
  expect(pipe.transform({ id: '019a11a1-1111-7111-8111-111111111111' })).toEqual({
    id: '019a11a1-1111-7111-8111-111111111111',
  });
});
it('CHG-038: input and editing problems keep their written sentence; identity and missing records do not', () => {
  const request = { id: 'trace' };
  expect(
    problem(new DomainError('CONFLICT', 409, 'The menu changed; reload before saving'), request)
      .detail,
  ).toBe('The menu changed; reload before saving');
  expect(
    problem(new DomainError('VALIDATION_FAILED', 400, 'Incorrect password'), request).detail,
  ).toBe('Incorrect password');
  for (const error of [
    new DomainError('NOT_FOUND', 404, 'Private file information'),
    new DomainError('ACCOUNT_SUSPENDED', 403, 'private identity'),
    new DomainError('FORBIDDEN', 403, 'private scope'),
  ])
    expect(JSON.stringify(problem(error, request))).not.toContain('private');
  expect(problem(new Error('private SQL'), request).detail).toBe('An unexpected error occurred');
});

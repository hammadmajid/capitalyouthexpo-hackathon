import { problemSchema, type ErrorCode } from '@hsm/contracts';
import type { z } from 'zod';
export class ClientFailure extends Error {
  constructor(readonly code: 'NETWORK_UNAVAILABLE' | 'INVALID_RESPONSE') {
    super(code === 'NETWORK_UNAVAILABLE' ? 'Connection unavailable' : 'Unexpected response');
    this.name = 'ClientFailure';
  }
}
export class ApiFailure extends Error {
  readonly code: ErrorCode;
  constructor(readonly problem: z.infer<typeof problemSchema>) {
    super('Request failed');
    this.name = 'ApiFailure';
    this.code = problem.code;
  }
}
interface ApiResult {
  data?: unknown;
  error?: unknown;
  response: Response;
}
export async function readApi<T>(operation: Promise<ApiResult>, schema: z.ZodType<T>): Promise<T> {
  let result: ApiResult;
  try {
    result = await operation;
  } catch (error) {
    throw new ClientFailure(
      error instanceof SyntaxError ? 'INVALID_RESPONSE' : 'NETWORK_UNAVAILABLE',
    );
  }
  if (!result.response.ok) {
    const problem = problemSchema.safeParse(result.error);
    if (!problem.success || problem.data.status !== result.response.status)
      throw new ClientFailure('INVALID_RESPONSE');
    throw new ApiFailure(problem.data);
  }
  const value = schema.safeParse(result.data);
  if (!value.success) throw new ClientFailure('INVALID_RESPONSE');
  return value.data;
}

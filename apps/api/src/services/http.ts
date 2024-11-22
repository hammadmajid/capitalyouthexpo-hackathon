import type { SchemaObject } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { stayIdentifierSchema } from '@hsm/contracts';
import { zodPipe } from '../problem.js';
import { identifier } from '../inventory/documentation.js';
export const idPipe = zodPipe(stayIdentifierSchema);
export const idempotencyHeader = { name: 'Idempotency-Key', required: true, schema: identifier };
export const date: SchemaObject = { type: 'string', format: 'date' };
export const money: SchemaObject = { type: 'integer', minimum: 0 };
export const version: SchemaObject = { type: 'integer', minimum: 1 };
// Responses are validated by strict Zod contracts in the services; the documented shape names
// the top-level object and lets clients parse it with the shared contract.
export const contractObject = (description: string): SchemaObject => ({
  type: 'object',
  description,
  additionalProperties: true,
});
export function replay<T>(
  reply: FastifyReply,
  result: { status: number; replayed: boolean; body: T },
) {
  reply
    .code(result.status)
    .header('Idempotency-Replayed', String(result.replayed))
    .header('Cache-Control', 'no-store');
  return result.body;
}

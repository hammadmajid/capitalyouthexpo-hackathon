import { z } from 'zod';
import type { Actor } from '../authorization/store.js';
import { InventoryGrantReadRepository } from './grants-read.repository.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export class InventoryGrantReadService {
  constructor(private readonly repository: InventoryGrantReadRepository) {}
  read(actor: Actor, branchId: string, assignmentId: string, query: unknown) {
    z.object({}).strict().parse(query);
    return this.repository.read(actor, id.parse(branchId), id.parse(assignmentId));
  }
}

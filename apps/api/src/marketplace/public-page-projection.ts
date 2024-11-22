import type { z } from 'zod';
import { invalidInventoryPage } from '../inventory/page-projection.js';
// Response metadata failures are server errors, never client validation failures.
export function projectPublicPage<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : invalidInventoryPage();
}

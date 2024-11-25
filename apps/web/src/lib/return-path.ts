import { z } from 'zod';
import type { SelfProfile } from '@hsm/contracts';
import { canEnter, type Context } from './capabilities';
import { parseDashboardQueuePath } from './dashboard-queue-path';
const destinations = new Map<string, Context>([
  ['/app/customer', 'customer'],
  ['/app/owner', 'owner'],
  ['/app/manager', 'manager'],
  ['/app/admin', 'admin'],
]);
const hostelReturnSchema = z
  .string()
  .regex(/^\/hostels\/[0-9a-f-]{36}$/)
  .refine((value) => z.string().uuid().safeParse(value.slice('/hostels/'.length)).success);
const returnPathSchema = z
  .string()
  .max(128)
  .pipe(
    z.union([
      z.enum([
        '/',
        '/app',
        '/app/security',
        '/app/customer-profile',
        '/app/owner-profile',
        '/app/customer',
        '/app/owner',
        '/app/manager',
        '/app/admin',
      ]),
      hostelReturnSchema,
    ]),
  );
// SEC-001: only implemented, canonical paths; no URL parsing or repeated decoding.
export function safeReturnPath(input: unknown): string | undefined {
  if (parseDashboardQueuePath(input)) return input as string;
  const result = returnPathSchema.safeParse(input);
  return result.success ? result.data : undefined;
}
export function loginDestination(input: unknown, profile: SelfProfile): string {
  const path = safeReturnPath(input);
  if (!path) return '/app';
  const context = destinations.get(path) ?? parseDashboardQueuePath(path)?.context;
  return !context || canEnter(profile, context) ? path : '/app';
}

export function authenticationPath(page: 'login' | 'register', input: unknown): string {
  const path = safeReturnPath(input);
  return '/' + page + (path ? '?returnTo=' + encodeURIComponent(path) : '');
}

export function customerProfilePath(input: unknown): string {
  const path = safeReturnPath(input);
  return '/app/customer-profile' + (path ? '?returnTo=' + encodeURIComponent(path) : '');
}

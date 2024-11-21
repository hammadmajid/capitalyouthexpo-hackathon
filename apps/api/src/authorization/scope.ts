import { SetMetadata, type Type, type ExecutionContext } from '@nestjs/common';
import { MetadataScanner, Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { z } from 'zod';
import { adminRoleSchema } from '@hsm/contracts';
export const ACCESS_SCOPE = 'hsm:access-scope';
const parameter = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
export const scopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('public') }).strict(),
  z.object({ kind: z.literal('self') }).strict(),
  z.object({ kind: z.literal('customer') }).strict(),
  z.object({ kind: z.literal('owner'), organizationParam: parameter.optional() }).strict(),
  z.object({ kind: z.literal('branch'), branchParam: parameter, ownerOnly: z.boolean() }).strict(),
  z
    .object({
      kind: z.literal('object'),
      resource: z.literal('manager_assignment'),
      idParam: parameter,
      branchParam: parameter.optional(),
      ownerOnly: z.boolean(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('admin'),
      roles: z.array(adminRoleSchema).min(1),
      rootOnly: z.boolean(),
    })
    .strict(),
  z.object({ kind: z.literal('stay') }).strict(),
]);
export type AccessScope = z.infer<typeof scopeSchema>;
const declare = (scope: AccessScope) => SetMetadata(ACCESS_SCOPE, Object.freeze(scope));
export const Public = () => declare({ kind: 'public' });
export const Self = () => declare({ kind: 'self' });
export const Customer = () => declare({ kind: 'customer' });
export const Owner = (organizationParam?: string) =>
  declare({ kind: 'owner', ...(organizationParam ? { organizationParam } : {}) });
export const BranchScope = (branchParam = 'branchId', ownerOnly = false) =>
  declare({ kind: 'branch', branchParam, ownerOnly });
export const ObjectScope = (idParam = 'assignmentId', branchParam?: string, ownerOnly = false) =>
  declare({
    kind: 'object',
    resource: 'manager_assignment',
    idParam,
    ...(branchParam ? { branchParam } : {}),
    ownerOnly,
  });
export const Admin = (roles: z.infer<typeof adminRoleSchema>[], rootOnly = false) =>
  declare({ kind: 'admin', roles, rootOnly });
export const Stay = () => declare({ kind: 'stay' });
export function declaration(
  reflector: Reflector,
  handler: ReturnType<ExecutionContext['getHandler']>,
  controller: Type,
) {
  return scopeSchema.safeParse(
    reflector.getAllAndOverride<unknown>(ACCESS_SCOPE, [handler, controller]),
  );
}
export function assertRouteScopes(controllers: Type[]) {
  const scanner = new MetadataScanner();
  const reflector = new Reflector();
  for (const controller of controllers) {
    const prototype: object = controller.prototype as object;
    for (const name of scanner.getAllMethodNames(prototype)) {
      const handler: unknown = Reflect.get(prototype, name);
      if (
        typeof handler !== 'function' ||
        Reflect.getMetadata(METHOD_METADATA, handler) === undefined
      )
        continue;
      if (!declaration(reflector, handler, controller).success)
        throw new Error('Missing or invalid route scope: ' + controller.name + '.' + name);
    }
  }
}

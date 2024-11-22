import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse, type SchemaObject } from '@nestjs/swagger';
const identifier: SchemaObject = { type: 'string', format: 'uuid' };
const status: SchemaObject = {
  type: 'string',
  enum: ['pending_activation', 'active', 'suspended', 'deactivated'],
};
export const organizationDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: identifier, name: { type: 'string' } },
};
export const branchDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'organizationId', 'brandId', 'name', 'verificationStatus'],
  properties: {
    id: identifier,
    organizationId: identifier,
    brandId: identifier,
    name: { type: 'string' },
    verificationStatus: {
      type: 'string',
      enum: [
        'draft',
        'submitted',
        'under_review',
        'changes_requested',
        'approved',
        'rejected',
        'suspended',
      ],
    },
  },
};
export const managerDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'userId', 'branchId', 'fullName', 'status'],
  properties: {
    id: identifier,
    userId: identifier,
    branchId: identifier,
    fullName: { type: 'string' },
    status,
  },
};
export const transitionDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'branchId', 'status'],
  properties: { id: identifier, branchId: identifier, status },
};
export const ManagementResponse = (schema: SchemaObject) => ApiResponse({ status: 200, schema });
export const ManagementList = (schema: SchemaObject) =>
  applyDecorators(
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiResponse({
      status: 200,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['data', 'nextCursor'],
        properties: {
          data: { type: 'array', items: schema },
          nextCursor: { anyOf: [identifier, { type: 'null' }] },
        },
      },
    }),
  );
// AUTH-M-006: removal / invitation cancellation confirms the Owner's own password.
export const ManagerRemovalInput = () =>
  ApiBody({
    required: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['currentPassword'],
      properties: { currentPassword: { type: 'string', minLength: 1, maxLength: 128 } },
    },
  });
export const ManagerActionInput = (reason = false) =>
  ApiBody({
    required: reason,
    schema: {
      type: 'object',
      additionalProperties: false,
      ...(reason ? { required: ['reason'] } : {}),
      properties: reason ? { reason: { type: 'string', minLength: 1, maxLength: 500 } } : {},
    },
  });

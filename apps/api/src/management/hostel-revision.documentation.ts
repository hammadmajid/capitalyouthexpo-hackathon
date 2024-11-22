import type { SchemaObject } from '@nestjs/swagger';
import {
  setupBasicsDocumentation,
  setupMainInputDocumentation,
  setupReadDocumentation,
} from './hostel-setup.documentation.js';
// CHG-041: OpenAPI shapes for pending changes to an approved hostel.
const identifier: SchemaObject = { type: 'string', format: 'uuid' };
const instant: SchemaObject = { type: 'string', format: 'date-time' };
const changes: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['basics', 'main'],
  properties: {
    basics: { ...setupBasicsDocumentation, nullable: true },
    main: { ...setupMainInputDocumentation, nullable: true },
  },
};
export const revisionDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'brandId',
    'branchId',
    'status',
    'changes',
    'version',
    'submittedAt',
    'decidedAt',
    'decisionNote',
    'updatedAt',
  ],
  properties: {
    id: identifier,
    brandId: identifier,
    branchId: identifier,
    status: { type: 'string', enum: ['draft', 'submitted', 'approved', 'rejected', 'cancelled'] },
    changes,
    version: { type: 'integer', minimum: 1 },
    submittedAt: { ...instant, nullable: true },
    decidedAt: { ...instant, nullable: true },
    decisionNote: { type: 'string', nullable: true },
    updatedAt: instant,
  },
};
export const revisionStateDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['live', 'revision'],
  properties: {
    live: setupReadDocumentation,
    revision: { ...revisionDocumentation, nullable: true },
  },
};
export const revisionSaveDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 1, nullable: true },
    basics: setupBasicsDocumentation,
    main: setupMainInputDocumentation,
  },
};
export const revisionCommandDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: { expectedVersion: { type: 'integer', minimum: 1 } },
};
export const revisionDecisionDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion', 'action'],
  properties: {
    expectedVersion: { type: 'integer', minimum: 1 },
    action: { type: 'string', enum: ['approve', 'reject'] },
    reason: { type: 'string', minLength: 1, maxLength: 1000 },
  },
};
export const revisionQueueDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'nextCursor'],
  properties: {
    data: {
      type: 'array',
      maxItems: 50,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'brandId', 'branchId', 'branchName', 'organizationName', 'submittedAt'],
        properties: {
          id: identifier,
          brandId: identifier,
          branchId: identifier,
          branchName: { type: 'string' },
          organizationName: { type: 'string' },
          submittedAt: instant,
        },
      },
    },
    nextCursor: { ...identifier, nullable: true },
  },
};
export const revisionReviewDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['revision', 'branchName', 'organizationName', 'live'],
  properties: {
    revision: revisionDocumentation,
    branchName: { type: 'string' },
    organizationName: { type: 'string' },
    live: setupReadDocumentation,
    placeNames: {
      type: 'object',
      description: 'City/area/sub-area names for every id in the live and proposed location',
      additionalProperties: { type: 'string' },
    },
  },
};

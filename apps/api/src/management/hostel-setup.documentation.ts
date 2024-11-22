import type { SchemaObject } from '@nestjs/swagger';
const identifier: SchemaObject = { type: 'string', format: 'uuid' };
const nullableId: SchemaObject = { ...identifier, nullable: true };
const name: SchemaObject = { type: 'string', minLength: 2, maxLength: 150 };
const category: SchemaObject = {
  type: 'string',
  enum: ['boys', 'girls', 'working_male', 'working_female'],
  nullable: true,
};
const phone: SchemaObject = {
  type: 'string',
  minLength: 7,
  maxLength: 30,
  pattern: '^\\+?[\\d ()-]+$',
  nullable: true,
};
const status: SchemaObject = {
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
  nullable: true,
};
const missing: SchemaObject = {
  type: 'array',
  maxItems: 6,
  items: {
    type: 'string',
    enum: ['main_branch', 'category', 'city', 'area', 'address', 'location'],
  },
};
const location: SchemaObject = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  required: ['latitude', 'longitude'],
  properties: {
    latitude: { type: 'number', minimum: -90, maximum: 90 },
    longitude: { type: 'number', minimum: -180, maximum: 180 },
  },
};
const common = {
  name,
  category,
  phone,
  description: { type: 'string', maxLength: 5000, nullable: true } as SchemaObject,
  showPublicContact: { type: 'boolean' } as SchemaObject,
};
export const setupBasicsDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: { ...common, logoFileId: nullableId },
};
export const setupMainInputDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    ...common,
    cityId: nullableId,
    areaId: nullableId,
    subAreaId: nullableId,
    addressLine: { type: 'string', minLength: 5, maxLength: 500, nullable: true },
    location,
    nearbyLandmark: { type: 'string', maxLength: 200, nullable: true },
  },
};
export const setupStateDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'organizationId', 'mainBranchId', 'verificationStatus', 'missingFields'],
  properties: {
    id: identifier,
    organizationId: identifier,
    mainBranchId: nullableId,
    verificationStatus: status,
    missingFields: missing,
  },
};
const summary: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'organizationId', 'name', 'logoFileId'],
  properties: { id: identifier, organizationId: identifier, name, logoFileId: nullableId },
};
const main: SchemaObject = {
  type: 'object',
  nullable: true,
  additionalProperties: false,
  required: [
    'id',
    'name',
    'isPrimary',
    'category',
    'cityId',
    'areaId',
    'subAreaId',
    'addressLine',
    'location',
    'nearbyLandmark',
    'description',
    'phone',
    'showPublicContact',
    'verificationStatus',
  ],
  properties: {
    ...setupMainInputDocumentation.properties,
    id: identifier,
    isPrimary: { type: 'boolean' },
    verificationStatus: { ...status, nullable: false },
    phone: { type: 'string', nullable: true },
    addressLine: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    nearbyLandmark: { type: 'string', nullable: true },
  },
};
export const setupReadDocumentation: SchemaObject = {
  ...summary,
  required: [...(summary.required ?? []), 'mainBranch', 'missingFields'],
  properties: {
    ...summary.properties,
    mainBranch: main,
    missingFields: missing,
    verificationNote: {
      type: 'string',
      minLength: 1,
      maxLength: 1000,
      nullable: true,
      description: 'Latest HSM reason while changes are requested or the hostel was rejected',
    },
  },
};
export const setupPageDocumentation: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['data', 'nextCursor'],
  properties: { data: { type: 'array', maxItems: 100, items: summary }, nextCursor: nullableId },
};

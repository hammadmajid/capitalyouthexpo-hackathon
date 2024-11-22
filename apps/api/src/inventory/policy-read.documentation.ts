import { object, identifier, nullable } from './documentation.js';
import {
  policyDocumentation,
  policyOverrideDocumentation,
  platformLimitsDocumentation,
} from '../booking/documentation.js';
const target = object({
  level: { type: 'string', enum: ['platform', 'hostel', 'branch', 'room_type'] },
  scopeId: nullable(identifier),
});
const version = object({
  id: identifier,
  level: { type: 'string', enum: ['platform', 'hostel', 'branch', 'room_type'] },
  scopeId: nullable(identifier),
});
export const policyReadDocumentation = {
  oneOf: [
    object({
      configured: { type: 'boolean', enum: [false] },
      target,
      canEdit: { type: 'boolean' },
    }),
    object({
      configured: { type: 'boolean', enum: [true] },
      target,
      canEdit: { type: 'boolean' },
      localVersion: nullable(version),
      overrides: nullable(policyOverrideDocumentation),
      inherited: nullable(policyDocumentation),
      effective: policyDocumentation,
      limits: platformLimitsDocumentation,
      lineage: { type: 'array', minItems: 1, maxItems: 4, items: version },
    }),
  ],
};

import { calendarDateSchema } from './dates.js';
// PostgreSQL AD dates have no year zero; pure ISO calendar arithmetic remains unchanged.
export const databaseDateSchema = calendarDateSchema.refine(
  (value) => value >= '0001-01-01',
  'Unsupported database date',
);

import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { v7 } from 'uuid';

export const citext = customType<{ data: string }>({ dataType: () => 'citext' });
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });
export const geography = customType<{ data: string }>({ dataType: () => 'geography(Point,4326)' });
export const identifier = () => uuid('id').primaryKey().$defaultFn(v7);
export const instant = (name: string) => timestamp(name, { withTimezone: true });
export const timestamps = () => ({
  createdAt: instant('created_at').defaultNow().notNull(),
  updatedAt: instant('updated_at').defaultNow().notNull(),
});

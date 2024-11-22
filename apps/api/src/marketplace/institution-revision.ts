import { sql } from 'drizzle-orm';
import { platformAuditLog } from '@hsm/db';

// Durable institution revision without altering the existing database schema.
// Every committed institution.saved audit event advances this token.
// Historical institution records without this audit event begin at revision 0.
export const institutionRevision = sql<string>`
  coalesce(
    (
      select max(${platformAuditLog.id})::text
      from ${platformAuditLog}
      where ${platformAuditLog.targetId} = "places"."id"
        and ${platformAuditLog.targetType} = 'place'
        and ${platformAuditLog.action} = 'institution.saved'
    ),
    '0'
  )
`;

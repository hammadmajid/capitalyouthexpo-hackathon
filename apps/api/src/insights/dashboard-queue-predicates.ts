import { and, eq, gte, inArray, lte, notInArray, or } from 'drizzle-orm';
import { complaints, stays } from '@hsm/db';
import { addRentDays } from '@hsm/contracts';
// AUD-009: counts and destinations share precisely the same operational scope.
export const unresolvedComplaints = () => notInArray(complaints.status, ['resolved', 'closed']);
export const upcomingCheckouts = (today: string) =>
  or(
    inArray(stays.state, ['notice_given', 'checkout_pending']),
    and(
      eq(stays.state, 'active'),
      gte(stays.expectedLeaveDate, today),
      lte(stays.expectedLeaveDate, addRentDays(today, 14n)),
    ),
  );

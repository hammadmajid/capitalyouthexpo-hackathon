import { afterAll, expect, it } from 'vitest';
import { createDatabase } from '@hsm/db';
import { ruleIds as ids } from '../../test/unit/listing-rules.fixture.js';
import { publicListingRulesQuery } from './listing-rules-query.js';
// SQL construction only: no PostgreSQL connection/query executes here.
const connection = createDatabase('postgres://localhost/listing_rules_statement_unit');
afterAll(async () => {
  await connection.close();
});
it('ACC-002: public rule paging uses one bounded current-parent visibility snapshot without private fields', () => {
  const statement = publicListingRulesQuery(connection.db, ids.branch, { limit: 20 }).toSQL();
  expect(statement.params.filter((value) => value === 21)).toHaveLength(2);
  expect(statement.params.filter((value) => value === ids.branch)).toHaveLength(2);
  expect(statement.params).toContain('approved');
  expect(statement.params).toContain(true);
  for (const value of ['left join', 'public_hostel_rules', 'listing_hidden_at', 'archived_at'])
    expect(statement.sql).toContain(value);
  expect(statement.sql).not.toMatch(
    /actor_user_id|revision|cnic|booking_documents|rent_invoice|audit/,
  );
});
it('ACC-002: continuation uses exact greater-than order/UUID position with a server-enforced page bound', () => {
  const statement = publicListingRulesQuery(connection.db, ids.branch, {
    limit: 1,
    cursor: '7:' + ids.second,
  }).toSQL();
  expect(statement.params).toContain(7);
  expect(statement.params).toContain(ids.second);
  expect(statement.params.filter((value) => value === 2)).toHaveLength(2);
  expect(statement.sql).toContain('order by');
  expect(statement.sql).toContain(' > ');
});

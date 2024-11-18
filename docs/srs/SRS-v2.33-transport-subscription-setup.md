# SRS v2.33 · Mobile Transport subscription setup

CHG-047 supplements SERV-002, FIN-001 and CHG-046.

- Amenities & Services → Transport routes sets the branch monthly subscription fee, due day and refund rule. Billing Policy selects included or separate billing. A saved subscription can be prepared before choosing a mode and is published when separate billing is active.
- The mobile form carries forward a saved partial-month rule. A new monthly subscription without an existing rule bills by days covered with half-up rounding. Signed agreements and issued invoices retain their terms.
- The versioned branch policy JSON can hold saved monthly subscription terms while an included offer or an unset offer is active. Existing policy and agreement JSON remains valid. This change requires no database migration.

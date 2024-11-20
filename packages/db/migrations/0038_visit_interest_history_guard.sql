-- VISIT-001 / ACC-006: customer interest changes append a new historical response.
CREATE TRIGGER visit_interest_responses_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON visit_interest_responses FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();

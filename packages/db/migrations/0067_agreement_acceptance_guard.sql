-- STAY-002: reuse the established immutable history/audit guard.
CREATE TRIGGER agreement_acceptances_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON agreement_acceptances
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();

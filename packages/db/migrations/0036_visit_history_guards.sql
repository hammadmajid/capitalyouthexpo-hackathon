-- VISIT-001 / ACC-006: preserve original times and decisions, including against TRUNCATE.
CREATE TRIGGER visit_history_append_only BEFORE UPDATE OR DELETE OR TRUNCATE
ON visit_history FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();

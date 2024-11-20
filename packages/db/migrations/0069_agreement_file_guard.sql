-- STAY-002: scans are append-only evidence of the exact original stay agreement.
CREATE TRIGGER stay_agreement_files_append_only
BEFORE UPDATE OR DELETE OR TRUNCATE ON stay_agreement_files
FOR EACH STATEMENT EXECUTE FUNCTION hsm_reject_audit_mutation();

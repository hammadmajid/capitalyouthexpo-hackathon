CREATE TABLE "profile_review_decisions" (
	"request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_review_decisions_request_id_version_pk" PRIMARY KEY("request_id","version"),
	CONSTRAINT "profile_review_decision_version_check" CHECK ("profile_review_decisions"."version" > 1),
	CONSTRAINT "profile_review_decision_action_check" CHECK ("profile_review_decisions"."action" in ('approve','reject','withdraw','cancel')),
	CONSTRAINT "profile_review_decision_reason_check" CHECK (length(btrim("profile_review_decisions"."reason")) between 8 and 500)
);
--> statement-breakpoint
CREATE TABLE "profile_review_evidence" (
	"request_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "profile_review_evidence_request_id_position_pk" PRIMARY KEY("request_id","position"),
	CONSTRAINT "profile_review_evidence_position_check" CHECK ("profile_review_evidence"."position" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "profile_review_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reason" text NOT NULL,
	"baseline_digest" "bytea" NOT NULL,
	"previous_full_name" text,
	"proposed_full_name" text,
	"previous_cnic_hash" "bytea",
	"previous_cnic_encrypted" "bytea",
	"previous_cnic_last4" text,
	"proposed_cnic_hash" "bytea",
	"proposed_cnic_encrypted" "bytea",
	"proposed_cnic_last4" text,
	"previous_photo_file_id" uuid,
	"proposed_photo_file_id" uuid,
	"submitted_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "profile_review_kind_data_check" CHECK (("profile_review_requests"."kind" = 'identity' and "profile_review_requests"."previous_photo_file_id" is null and "profile_review_requests"."proposed_photo_file_id" is null) or ("profile_review_requests"."kind" = 'profile_photo' and "profile_review_requests"."previous_full_name" is null and "profile_review_requests"."previous_cnic_hash" is null and "profile_review_requests"."previous_cnic_encrypted" is null and "profile_review_requests"."previous_cnic_last4" is null)),
	CONSTRAINT "profile_review_kind_check" CHECK ("profile_review_requests"."kind" in ('identity','profile_photo')),
	CONSTRAINT "profile_review_state_check" CHECK ("profile_review_requests"."status" in ('pending','approved','rejected','cancelled','withdrawn') and ("profile_review_requests"."kind" <> 'identity' or "profile_review_requests"."status" <> 'withdrawn')),
	CONSTRAINT "profile_review_version_check" CHECK ("profile_review_requests"."version" > 0),
	CONSTRAINT "profile_review_reason_check" CHECK (length(btrim("profile_review_requests"."reason")) between 8 and 500),
	CONSTRAINT "profile_review_digest_check" CHECK (octet_length("profile_review_requests"."baseline_digest") = 32),
	CONSTRAINT "profile_review_payload_check" CHECK (("profile_review_requests"."kind" = 'identity' and "profile_review_requests"."proposed_photo_file_id" is null and ("profile_review_requests"."proposed_full_name" is not null or "profile_review_requests"."proposed_cnic_hash" is not null)) or ("profile_review_requests"."kind" = 'profile_photo' and "profile_review_requests"."proposed_photo_file_id" is not null and "profile_review_requests"."proposed_full_name" is null and "profile_review_requests"."proposed_cnic_hash" is null)),
	CONSTRAINT "profile_review_cnic_check" CHECK (("profile_review_requests"."proposed_cnic_hash" is null and "profile_review_requests"."proposed_cnic_encrypted" is null and "profile_review_requests"."proposed_cnic_last4" is null) or ("profile_review_requests"."proposed_cnic_hash" is not null and octet_length("profile_review_requests"."proposed_cnic_hash") = 32 and "profile_review_requests"."proposed_cnic_encrypted" is not null and "profile_review_requests"."proposed_cnic_last4" is not null and "profile_review_requests"."proposed_cnic_last4" ~ '^[0-9]{4}$')),
	CONSTRAINT "profile_review_name_check" CHECK ("profile_review_requests"."proposed_full_name" is null or length(btrim("profile_review_requests"."proposed_full_name")) between 2 and 150)
);
--> statement-breakpoint
ALTER TABLE "profile_review_decisions" ADD CONSTRAINT "profile_review_decisions_request_id_profile_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."profile_review_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_review_decisions" ADD CONSTRAINT "profile_review_decisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_review_evidence" ADD CONSTRAINT "profile_review_evidence_request_id_profile_review_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."profile_review_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_review_evidence" ADD CONSTRAINT "profile_review_evidence_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_review_requests" ADD CONSTRAINT "profile_review_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_review_requests" ADD CONSTRAINT "profile_review_requests_previous_photo_file_id_files_id_fk" FOREIGN KEY ("previous_photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_review_requests" ADD CONSTRAINT "profile_review_requests_proposed_photo_file_id_files_id_fk" FOREIGN KEY ("proposed_photo_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_review_evidence_file_uq" ON "profile_review_evidence" USING btree ("request_id","file_id");--> statement-breakpoint
CREATE INDEX "profile_review_queue_idx" ON "profile_review_requests" USING btree ("kind","status","id");--> statement-breakpoint
CREATE INDEX "profile_review_user_idx" ON "profile_review_requests" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_review_one_pending_uq" ON "profile_review_requests" USING btree ("user_id","kind") WHERE "profile_review_requests"."status" = 'pending';
--> statement-breakpoint
CREATE FUNCTION hsm_profile_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Profile review history is immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profile_review_decisions_immutable BEFORE UPDATE OR DELETE ON profile_review_decisions FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_immutable();
--> statement-breakpoint
CREATE TRIGGER profile_review_evidence_immutable BEFORE UPDATE OR DELETE ON profile_review_evidence FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_immutable();
--> statement-breakpoint
CREATE TRIGGER profile_review_requests_no_delete BEFORE DELETE ON profile_review_requests FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_immutable();
--> statement-breakpoint
CREATE FUNCTION hsm_profile_review_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.version <> 1 THEN
      RAISE EXCEPTION 'Review must begin pending at revision one' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status','version','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','version','updated_at'])
    OR NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at
    OR NOT ((OLD.status = 'pending' AND NEW.status IN ('approved','rejected','cancelled'))
      OR (OLD.kind = 'profile_photo' AND OLD.status = 'approved' AND NEW.status = 'withdrawn')) THEN
    RAISE EXCEPTION 'Invalid review transition or immutable payload change' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profile_review_request_transition BEFORE INSERT OR UPDATE ON profile_review_requests FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_transition();
--> statement-breakpoint
CREATE FUNCTION hsm_profile_review_evidence_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE request profile_review_requests%ROWTYPE;
BEGIN
  SELECT * INTO request FROM profile_review_requests WHERE id = NEW.request_id FOR KEY SHARE;
  IF request.status IS DISTINCT FROM 'pending' OR request.version IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Evidence is immutable after a review decision' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM files WHERE id = NEW.file_id AND uploaded_by = request.user_id
    AND visibility = 'private' AND scan_status = 'clean'
    AND purpose::text = CASE WHEN request.kind = 'identity' THEN 'verification_document' ELSE 'avatar' END) THEN
    RAISE EXCEPTION 'Evidence must belong to the review subject' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profile_review_evidence_guard BEFORE INSERT ON profile_review_evidence FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_evidence_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_profile_review_decision_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profile_review_requests WHERE id = NEW.request_id AND version = NEW.version
    AND status = CASE NEW.action WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' WHEN 'cancel' THEN 'cancelled' WHEN 'withdraw' THEN 'withdrawn' END) THEN
    RAISE EXCEPTION 'Decision must match the current review revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER profile_review_decision_guard BEFORE INSERT ON profile_review_decisions FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_decision_guard();
--> statement-breakpoint
CREATE FUNCTION hsm_profile_review_requires_decision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profile_review_decisions WHERE request_id = NEW.id AND version = NEW.version
    AND action = CASE NEW.status WHEN 'approved' THEN 'approve' WHEN 'rejected' THEN 'reject' WHEN 'cancelled' THEN 'cancel' WHEN 'withdrawn' THEN 'withdraw' END) THEN
    RAISE EXCEPTION 'Review transition requires its durable decision' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER profile_review_requires_decision AFTER UPDATE ON profile_review_requests DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION hsm_profile_review_requires_decision();

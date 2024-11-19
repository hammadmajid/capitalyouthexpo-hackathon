ALTER TABLE "notification_outbox" ADD COLUMN "lease_token" uuid;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD COLUMN "lease_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "outbox_lease_pair_check" CHECK (("notification_outbox"."lease_token" is null) = ("notification_outbox"."lease_expires_at" is null));
ALTER TABLE "residents" ADD COLUMN "cnic_hash" "bytea";--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "cnic_encrypted" "bytea";--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "cnic_last4" char(4);--> statement-breakpoint
ALTER TABLE "residents" ADD CONSTRAINT "residents_cnic_check" CHECK (("residents"."cnic_hash" is null and "residents"."cnic_encrypted" is null and "residents"."cnic_last4" is null) or (octet_length("residents"."cnic_hash") = 32 and "residents"."cnic_encrypted" is not null and "residents"."cnic_last4" ~ '^[0-9]{4}$'));
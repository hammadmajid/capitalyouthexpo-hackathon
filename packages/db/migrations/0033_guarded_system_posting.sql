ALTER TABLE "resident_charges" ALTER COLUMN "posted_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "resident_invoices" ALTER COLUMN "issued_by_user_id" DROP NOT NULL;
ALTER TABLE "invoices" RENAME COLUMN "pay_url" TO "pay_token";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "emailed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_pay_token_idx" ON "invoices" USING btree ("pay_token");
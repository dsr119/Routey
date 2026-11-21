ALTER TABLE "businesses" ADD COLUMN "payment_terms_days" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "text_invoices" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "texted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "first_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "last_viewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "view_count" integer DEFAULT 0 NOT NULL;
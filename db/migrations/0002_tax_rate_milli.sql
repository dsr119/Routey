ALTER TABLE "invoices" RENAME COLUMN "tax_basis_points" TO "tax_rate_milli";--> statement-breakpoint
ALTER TABLE "tax_rates" RENAME COLUMN "basis_points" TO "rate_milli";
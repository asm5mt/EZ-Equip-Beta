ALTER TABLE "service_facilities" ADD COLUMN "address_line" text;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "zip" text;--> statement-breakpoint
-- Backfill existing free-text "address" values (format: "street, city, state zip")
-- into the new structured columns, since this table already has live rows.
UPDATE "service_facilities"
SET
  "address_line" = trim(split_part("address", ',', 1)),
  "city" = trim(split_part("address", ',', 2)),
  "state" = trim(split_part(trim(split_part("address", ',', 3)), ' ', 1)),
  "zip" = trim(split_part(trim(split_part("address", ',', 3)), ' ', 2))
WHERE "address" IS NOT NULL AND "address" <> '';
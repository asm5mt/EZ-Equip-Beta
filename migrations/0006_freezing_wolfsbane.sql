CREATE TABLE "service_facility_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"icon" text DEFAULT 'wrench' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_facilities" ALTER COLUMN "fleet_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "type" text;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "latitude" real;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "longitude" real;
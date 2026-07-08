CREATE TABLE "service_facility_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"facility_id" integer NOT NULL,
	"label" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"address_line" text,
	"address_line_2" text,
	"city" text,
	"state" text,
	"zip" text,
	"country" text DEFAULT 'US' NOT NULL,
	"latitude" real,
	"longitude" real
);
--> statement-breakpoint
ALTER TABLE "service_facility_addresses" ADD CONSTRAINT "service_facility_addresses_facility_id_service_facilities_id_fk" FOREIGN KEY ("facility_id") REFERENCES "public"."service_facilities"("id") ON DELETE no action ON UPDATE no action;
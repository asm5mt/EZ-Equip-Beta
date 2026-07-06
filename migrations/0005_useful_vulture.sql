CREATE TABLE "service_facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"technician" text,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "service_events" ADD COLUMN "service_facility_id" integer;--> statement-breakpoint
ALTER TABLE "service_events" ADD COLUMN "facility_address" text;--> statement-breakpoint
ALTER TABLE "service_events" ADD COLUMN "facility_phone" text;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD CONSTRAINT "service_facilities_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_facility_id_service_facilities_id_fk" FOREIGN KEY ("service_facility_id") REFERENCES "public"."service_facilities"("id") ON DELETE no action ON UPDATE no action;
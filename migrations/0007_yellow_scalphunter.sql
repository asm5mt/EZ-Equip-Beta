ALTER TABLE "service_facilities" DROP CONSTRAINT "service_facilities_fleet_id_fleets_id_fk";
--> statement-breakpoint
ALTER TABLE "service_facilities" DROP COLUMN "fleet_id";
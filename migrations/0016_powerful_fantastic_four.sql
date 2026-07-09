CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"actor_user_id" integer,
	"actor_label" text NOT NULL,
	"fleet_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"entity_label" text NOT NULL,
	"changes" jsonb,
	"ip_address" text
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "audit_log_retention_days" integer;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;
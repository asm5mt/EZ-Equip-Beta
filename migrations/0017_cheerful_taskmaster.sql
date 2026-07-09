ALTER TABLE "system_settings" ADD COLUMN "zip_lookup_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "zip_lookup_provider" text DEFAULT 'seeded' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "zip_lookup_custom_url" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "zip_lookup_api_key" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "geocoding_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "geocoding_provider" text DEFAULT 'seeded' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "geocoding_custom_url" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "geocoding_api_key" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "nhtsa_lookup_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "nhtsa_lookup_provider" text DEFAULT 'seeded' NOT NULL;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "nhtsa_lookup_custom_url" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "nhtsa_lookup_api_key" text;
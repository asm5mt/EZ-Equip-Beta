CREATE TABLE "lookup_providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"auth_method" text DEFAULT 'none' NOT NULL,
	"auth_param_name" text,
	"auth_value" text,
	"bearer_prefix" boolean DEFAULT false NOT NULL,
	"oauth_token_url" text,
	"oauth_client_id" text,
	"oauth_client_secret" text,
	"oauth_scope" text,
	"response_shape_preset" text,
	"lat_path" text,
	"lon_path" text,
	"coordinates_array_path" text,
	"coordinates_reversed" boolean DEFAULT false NOT NULL,
	"city_path" text,
	"state_path" text
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "zip_lookup_selected_provider_id" integer;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "geocoding_selected_provider_id" integer;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "nhtsa_lookup_selected_provider_id" integer;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_zip_lookup_selected_provider_id_lookup_providers_id_fk" FOREIGN KEY ("zip_lookup_selected_provider_id") REFERENCES "public"."lookup_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_geocoding_selected_provider_id_lookup_providers_id_fk" FOREIGN KEY ("geocoding_selected_provider_id") REFERENCES "public"."lookup_providers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_nhtsa_lookup_selected_provider_id_lookup_providers_id_fk" FOREIGN KEY ("nhtsa_lookup_selected_provider_id") REFERENCES "public"."lookup_providers"("id") ON DELETE no action ON UPDATE no action;
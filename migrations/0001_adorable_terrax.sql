CREATE TABLE "fleet_role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"permission_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_group_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_name" text NOT NULL,
	"fleet_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	CONSTRAINT "oidc_group_mappings_group_name_unique" UNIQUE("group_name")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"auth_mode" text DEFAULT 'local' NOT NULL,
	"oidc_issuer_url" text,
	"oidc_client_id" text,
	"oidc_client_secret" text,
	"oidc_redirect_uri" text
);
--> statement-breakpoint
ALTER TABLE "fleet_memberships" ADD COLUMN "role_id" integer;--> statement-breakpoint
ALTER TABLE "fleet_memberships" ADD COLUMN "granted_by" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "auth_provider" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "external_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "exempt_from_global_auth_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_role_permissions" ADD CONSTRAINT "fleet_role_permissions_role_id_fleet_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."fleet_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_group_mappings" ADD CONSTRAINT "oidc_group_mappings_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_group_mappings" ADD CONSTRAINT "oidc_group_mappings_role_id_fleet_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."fleet_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_memberships" ADD CONSTRAINT "fleet_memberships_role_id_fleet_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."fleet_roles"("id") ON DELETE no action ON UPDATE no action;
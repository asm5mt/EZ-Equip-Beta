CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"site_id" integer,
	"friendly_name" text NOT NULL,
	"asset_type" text NOT NULL,
	"year" integer,
	"make" text,
	"model" text,
	"trim" text,
	"vin" text,
	"serial" text,
	"plate_jurisdiction" text,
	"plate_number" text,
	"engine" text,
	"transmission" text,
	"drivetrain" text,
	"fuel_type" text,
	"displacement_liters" real,
	"engine_cylinders" integer,
	"engine_configuration" text,
	"gvwr" text,
	"body_type" text,
	"vin_decoded_fields" text,
	"acquisition_date" timestamp,
	"meter_type" text DEFAULT 'mileage' NOT NULL,
	"meter_label" text,
	"current_meter" real DEFAULT 0 NOT NULL,
	"meter_as_of" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"inactive_reason" text,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"data_url" text NOT NULL,
	"notes" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_equipment_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"icon" text DEFAULT 'equipment' NOT NULL,
	"default_meter" text DEFAULT 'mileage' NOT NULL,
	"enable_vin_features" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_fuel_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"color" text DEFAULT '#dc2626' NOT NULL,
	"icon" text DEFAULT 'fuel' NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_memberships" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleet_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"permission" text DEFAULT 'viewer' NOT NULL,
	"description" text,
	"built_in" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fleets" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"notes" text,
	CONSTRAINT "fleets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inventory_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_category_fields" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" text NOT NULL,
	"field_type" text DEFAULT 'text' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"sku" text,
	"part_number" text,
	"unit" text DEFAULT 'each' NOT NULL,
	"on_hand" real DEFAULT 0 NOT NULL,
	"low_stock_alert" boolean DEFAULT true NOT NULL,
	"low_stock_quantity" real,
	"reorder_reminder" boolean DEFAULT false NOT NULL,
	"reorder_point" real,
	"reorder_quantity" real,
	"cost_tracking" boolean DEFAULT false NOT NULL,
	"stocked" boolean DEFAULT true NOT NULL,
	"unit_cost" real,
	"custom_fields" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"inventory_item_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"quantity" real NOT NULL,
	"service_event_id" integer,
	"occurred_at" timestamp NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedule_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"schedule_id" integer NOT NULL,
	"asset_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_schedules" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" text DEFAULT 'asset' NOT NULL,
	"fleet_id" integer,
	"asset_id" integer,
	"name" text NOT NULL,
	"category" text,
	"reading_type" text DEFAULT 'mileage' NOT NULL,
	"meter_interval" real,
	"day_interval" integer,
	"meter_due_soon" real,
	"day_due_soon" integer,
	"applies_to_asset_types" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meter_readings" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"reading_type" text NOT NULL,
	"value" real NOT NULL,
	"reading_date" timestamp NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_id" integer NOT NULL,
	"schedule_id" integer,
	"event_type" text DEFAULT 'scheduled' NOT NULL,
	"title" text NOT NULL,
	"performed_at" timestamp NOT NULL,
	"meter_at_service" real,
	"vendor" text,
	"technician" text,
	"cost" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "service_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_event_id" integer NOT NULL,
	"inventory_item_id" integer,
	"item_name" text NOT NULL,
	"part_number" text,
	"brand" text,
	"spec" text,
	"quantity" real DEFAULT 1 NOT NULL,
	"unit" text,
	"unit_cost" real,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" serial PRIMARY KEY NOT NULL,
	"fleet_id" integer NOT NULL,
	"name" text NOT NULL,
	"address" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"password_hash" text,
	"system_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_equipment_types" ADD CONSTRAINT "fleet_equipment_types_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_fuel_types" ADD CONSTRAINT "fleet_fuel_types_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_memberships" ADD CONSTRAINT "fleet_memberships_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_memberships" ADD CONSTRAINT "fleet_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fleet_roles" ADD CONSTRAINT "fleet_roles_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_categories" ADD CONSTRAINT "inventory_categories_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_category_fields" ADD CONSTRAINT "inventory_category_fields_category_id_inventory_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."inventory_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule_assignments" ADD CONSTRAINT "maintenance_schedule_assignments_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedule_assignments" ADD CONSTRAINT "maintenance_schedule_assignments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_schedules" ADD CONSTRAINT "maintenance_schedules_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meter_readings" ADD CONSTRAINT "meter_readings_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_schedule_id_maintenance_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."maintenance_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_service_event_id_service_events_id_fk" FOREIGN KEY ("service_event_id") REFERENCES "public"."service_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_line_items" ADD CONSTRAINT "service_line_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_fleet_id_fleets_id_fk" FOREIGN KEY ("fleet_id") REFERENCES "public"."fleets"("id") ON DELETE no action ON UPDATE no action;
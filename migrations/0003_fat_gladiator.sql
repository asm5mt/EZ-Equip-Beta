ALTER TABLE "inventory_categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_categories" ADD COLUMN "color" text DEFAULT '#64748b' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_categories" ADD COLUMN "icon" text DEFAULT 'package' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_category_fields" ADD COLUMN "highlight_field" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "display_name" text;
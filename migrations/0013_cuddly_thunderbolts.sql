ALTER TABLE "fleets" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "fleets" ADD COLUMN "default_country_code" text DEFAULT 'US' NOT NULL;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "address_line_2" text;--> statement-breakpoint
ALTER TABLE "service_facilities" ADD COLUMN "country" text DEFAULT 'US' NOT NULL;
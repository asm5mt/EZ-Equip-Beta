ALTER TABLE "fleet_memberships" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "fleet_memberships" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "fleet_roles" DROP COLUMN "permission";
import { pgTable, text, integer, real, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// EZ-EQUIP — domain schema (PostgreSQL)
// =============================================================================

// ----- Fleets / sites / users / memberships --------------------------------

export const fleets = pgTable("fleets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  // Auto-geocoded server-side from the address fields above (Nominatim) —
  // never manually entered. Null when geocoding fails.
  latitude: real("latitude"),
  longitude: real("longitude"),
});

export const sites = pgTable("sites", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  address: text("address"),
});

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  // local-auth simulation; AD integration will replace this layer.
  passwordHash: text("password_hash"),
  systemAdmin: boolean("system_admin").notNull().default(false),
  // 'local' | 'oidc'
  authProvider: text("auth_provider").notNull().default("local"),
  // OIDC `sub` claim, unique per provider
  externalId: text("external_id"),
  // Break-glass local admin: can always log in with local password even if
  // system_settings.auth_mode is set to OIDC-only.
  exemptFromGlobalAuthMode: boolean("exempt_from_global_auth_mode").notNull().default(false),
});

// Role per (user, fleet), via fleet_roles.
export const fleetMemberships = pgTable("fleet_memberships", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  roleId: integer("role_id").notNull().references(() => fleetRoles.id),
  // 'manual' | 'group' — so OIDC group-sync never silently overwrites a manual grant.
  grantedBy: text("granted_by").notNull().default("manual"),
});

export const fleetEquipmentTypes = pgTable("fleet_equipment_types", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("slate"),
  icon: text("icon").notNull().default("equipment"),
  defaultMeter: text("default_meter").notNull().default("mileage"),
  enableVinFeatures: boolean("enable_vin_features").notNull().default(false),
  active: boolean("active").notNull().default(true),
});

export const fleetRoles = pgTable("fleet_roles", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  description: text("description"),
  builtIn: boolean("built_in").notNull().default(false),
});

// Join table: which permission keys (see shared/permissions.ts) a role grants.
// No DB-level uniqueness — app code replaces a role's rows wholesale
// (delete-then-insert), matching the maintenance_schedule_assignments convention.
export const fleetRolePermissions = pgTable("fleet_role_permissions", {
  id: serial("id").primaryKey(),
  roleId: integer("role_id").notNull().references(() => fleetRoles.id),
  permissionKey: text("permission_key").notNull(),
});

// Maps an OIDC token's `groups` claim entry to a fleet + role. Reconciled on
// every OIDC login (phase 4); table only for now.
export const oidcGroupMappings = pgTable("oidc_group_mappings", {
  id: serial("id").primaryKey(),
  groupName: text("group_name").notNull().unique(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  roleId: integer("role_id").notNull().references(() => fleetRoles.id),
});

// Single-row table of global auth settings (auth_mode toggle + OIDC config).
// Distinct from `app_settings`, which holds arbitrary UI preferences.
export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  authMode: text("auth_mode").notNull().default("local"), // 'local' | 'oidc'
  oidcIssuerUrl: text("oidc_issuer_url"),
  oidcClientId: text("oidc_client_id"),
  oidcClientSecret: text("oidc_client_secret"),
  oidcRedirectUri: text("oidc_redirect_uri"),
  orgName: text("org_name"),
  orgLogoUrl: text("org_logo_url"),
});

export const inventoryCategories = pgTable("inventory_categories", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  color: text("color").notNull().default("#64748b"),
  icon: text("icon").notNull().default("package"),
});

export const inventoryCategoryFields = pgTable("inventory_category_fields", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => inventoryCategories.id),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull().default("text"),
  required: boolean("required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // At most one per category — enforced in server/storage.ts, not the DB.
  highlightField: boolean("highlight_field").notNull().default(false),
  // Any number per category. Values of checked fields are joined (in sortOrder)
  // as the fallback title when an item has no displayName. See client/src/lib/inventory-display.ts.
  inTitle: boolean("in_title").notNull().default(false),
});

export const fleetFuelTypes = pgTable("fleet_fuel_types", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#dc2626"),
  icon: text("icon").notNull().default("fuel"),
  active: boolean("active").notNull().default(true),
});

// ----- Assets / equipment --------------------------------------------------

export const assets = pgTable("assets", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  siteId: integer("site_id").references(() => sites.id),

  friendlyName: text("friendly_name").notNull(),
  // User-configured fleet asset type label. Behavior is controlled by the fleet asset type settings.
  assetType: text("asset_type").notNull(),

  year: integer("year"),
  make: text("make"),
  model: text("model"),
  trim: text("trim"),

  vin: text("vin"),
  serial: text("serial"),
  plateJurisdiction: text("plate_jurisdiction"),
  plateNumber: text("plate_number"),

  engine: text("engine"),
  transmission: text("transmission"),
  drivetrain: text("drivetrain"),
  fuelType: text("fuel_type"),
  displacementLiters: real("displacement_liters"),
  engineCylinders: integer("engine_cylinders"),
  engineConfiguration: text("engine_configuration"),
  gvwr: text("gvwr"),
  bodyType: text("body_type"),
  vinDecodedFields: text("vin_decoded_fields"),
  acquisitionDate: timestamp("acquisition_date", { mode: "date" }),

  // Primary meter for the asset.
  // 'mileage' | 'hours' | 'count' | 'custom'
  meterType: text("meter_type").notNull().default("mileage"),
  // Free-form label when meterType = 'custom'
  meterLabel: text("meter_label"),
  currentMeter: real("current_meter").notNull().default(0),
  meterAsOf: timestamp("meter_as_of", { mode: "date" }),

  isActive: boolean("is_active").notNull().default(true),
  inactiveReason: text("inactive_reason"),

  status: text("status").notNull().default("active"), // active | retired
  notes: text("notes"),
});

// ----- Meter readings ------------------------------------------------------

export const meterReadings = pgTable("meter_readings", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  readingType: text("reading_type").notNull(), // mileage | hours | count | custom
  value: real("value").notNull(),
  readingDate: timestamp("reading_date", { mode: "date" }).notNull(),
  notes: text("notes"),
  source: text("source").notNull().default("manual"), // manual | service-event
});

// ----- Maintenance schedules ----------------------------------------------
// Two distinct scopes coexist in this single table:
//   - 'fleet': shared template owned by a fleet; assigned to N assets via
//              `maintenance_schedule_assignments`. assetId is NULL.
//   - 'asset': one-off custom schedule belonging to a single asset. assetId is set.

export const maintenanceSchedules = pgTable("maintenance_schedules", {
  id: serial("id").primaryKey(),
  // 'fleet' | 'asset'
  scope: text("scope").notNull().default("asset"),
  // Set for both scopes when fleetId known. Required for fleet scope.
  fleetId: integer("fleet_id").references(() => fleets.id),
  // Null when scope = 'fleet'. Set when scope = 'asset'.
  assetId: integer("asset_id").references(() => assets.id),
  name: text("name").notNull(),
  category: text("category"),
  readingType: text("reading_type").notNull().default("mileage"), // mileage | hours | count | kilometers | custom
  meterInterval: real("meter_interval"),
  dayInterval: integer("day_interval"),
  meterDueSoon: real("meter_due_soon"),
  dayDueSoon: integer("day_due_soon"),
  // JSON array of asset-type names that this fleet schedule applies to (filter hint). null => all.
  appliesToAssetTypes: text("applies_to_asset_types"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
});

// Assignment of a fleet schedule to a specific asset.
export const maintenanceScheduleAssignments = pgTable("maintenance_schedule_assignments", {
  id: serial("id").primaryKey(),
  scheduleId: integer("schedule_id").notNull().references(() => maintenanceSchedules.id),
  assetId: integer("asset_id").notNull().references(() => assets.id),
});

// ----- Service facilities ---------------------------------------------------
// Instance-wide: shops/dealerships are shared across every fleet, not owned
// by one — a facility isn't re-entered per fleet just because two fleets
// happen to use the same dealership.

export const serviceFacilityTypes = pgTable("service_facility_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull().default("slate"),
  icon: text("icon").notNull().default("wrench"),
});

export const serviceFacilities = pgTable("service_facilities", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type"),
  addressLine: text("address_line"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  // Auto-geocoded server-side from the address fields above (Nominatim) —
  // never manually entered. Null when geocoding fails; distance sort/display
  // simply treats the facility as unlocatable.
  latitude: real("latitude"),
  longitude: real("longitude"),
  phone: text("phone"),
  technician: text("technician"),
  notes: text("notes"),
});

// ----- Service events ------------------------------------------------------

export const serviceEvents = pgTable("service_events", {
  id: serial("id").primaryKey(),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  scheduleId: integer("schedule_id").references(() => maintenanceSchedules.id),
  eventType: text("event_type").notNull().default("scheduled"), // scheduled | repair | unscheduled
  title: text("title").notNull(),
  performedAt: timestamp("performed_at", { mode: "date" }).notNull(),
  meterAtService: real("meter_at_service"),
  vendor: text("vendor"),
  technician: text("technician"),
  // If a saved service facility was picked, its name/technician are snapshotted
  // into vendor/technician above; address/phone are snapshotted here. Snapshots
  // keep historical work orders stable if the facility is later edited/deleted.
  serviceFacilityId: integer("service_facility_id").references(() => serviceFacilities.id),
  facilityAddress: text("facility_address"),
  facilityPhone: text("facility_phone"),
  cost: real("cost"),
  notes: text("notes"),
});

// ----- Service line items --------------------------------------------------

export const serviceLineItems = pgTable("service_line_items", {
  id: serial("id").primaryKey(),
  serviceEventId: integer("service_event_id").notNull().references(() => serviceEvents.id),

  // If an inventory item is consumed, link it. Otherwise leave null and
  // capture the one-off details in the freeform fields below.
  inventoryItemId: integer("inventory_item_id").references(() => inventoryItems.id),

  itemName: text("item_name").notNull(),
  partNumber: text("part_number"),
  brand: text("brand"),
  spec: text("spec"), // viscosity, grade, etc.
  quantity: real("quantity").notNull().default(1),
  unit: text("unit"), // qt | each | oz | ft | gal
  unitCost: real("unit_cost"),
  notes: text("notes"),
});

// ----- Inventory -----------------------------------------------------------

export const inventoryItems = pgTable("inventory_items", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  // Optional user-set nickname. Overrides the auto-generated `name` for display everywhere except search.
  displayName: text("display_name"),
  category: text("category"), // oil | filter | fluid | wiper | spark plug | grease | part | other
  sku: text("sku"),
  partNumber: text("part_number"),
  unit: text("unit").notNull().default("each"),
  onHand: real("on_hand").notNull().default(0),
  lowStockAlert: boolean("low_stock_alert").notNull().default(true),
  lowStockQuantity: real("low_stock_quantity"),
  reorderReminder: boolean("reorder_reminder").notNull().default(false),
  reorderPoint: real("reorder_point"),
  reorderQuantity: real("reorder_quantity"),
  costTracking: boolean("cost_tracking").notNull().default(false),
  // Compatibility flag from the early prototype. New UI uses lowStockAlert/reorderReminder.
  stocked: boolean("stocked").notNull().default(true),
  unitCost: real("unit_cost"),
  customFields: text("custom_fields"),
  notes: text("notes"),
});

// Stock movements provide an audit trail for adjustments and consumption.
export const inventoryMovements = pgTable("inventory_movements", {
  id: serial("id").primaryKey(),
  inventoryItemId: integer("inventory_item_id").notNull().references(() => inventoryItems.id),
  // 'adjustment' | 'consumption' | 'restock'
  movementType: text("movement_type").notNull(),
  quantity: real("quantity").notNull(), // negative for consumption, positive for restock
  serviceEventId: integer("service_event_id").references(() => serviceEvents.id),
  occurredAt: timestamp("occurred_at", { mode: "date" }).notNull(),
  notes: text("notes"),
});

// ----- Attachments ---------------------------------------------------------

export const attachments = pgTable("attachments", {
  id: serial("id").primaryKey(),
  // service-event | inventory-movement | inventory-item
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  dataUrl: text("data_url").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull(),
});

// ----- App settings --------------------------------------------------------

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull(),
});

// ===========================================================================
// Insert schemas / types
// ===========================================================================

export const insertFleetSchema = createInsertSchema(fleets).omit({ id: true });
export type InsertFleet = z.infer<typeof insertFleetSchema>;
export type Fleet = typeof fleets.$inferSelect;

export const insertSiteSchema = createInsertSchema(sites).omit({ id: true });
export type InsertSite = z.infer<typeof insertSiteSchema>;
export type Site = typeof sites.$inferSelect;

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const insertFleetMembershipSchema = createInsertSchema(fleetMemberships).omit({ id: true });
export type InsertFleetMembership = z.infer<typeof insertFleetMembershipSchema>;
export type FleetMembership = typeof fleetMemberships.$inferSelect;

export const insertFleetEquipmentTypeSchema = createInsertSchema(fleetEquipmentTypes).omit({ id: true });
export type InsertFleetEquipmentType = z.infer<typeof insertFleetEquipmentTypeSchema>;
export type FleetEquipmentType = typeof fleetEquipmentTypes.$inferSelect;

export const insertFleetRoleSchema = createInsertSchema(fleetRoles).omit({ id: true });
export type InsertFleetRole = z.infer<typeof insertFleetRoleSchema>;
export type FleetRole = typeof fleetRoles.$inferSelect;

export const insertFleetRolePermissionSchema = createInsertSchema(fleetRolePermissions).omit({ id: true });
export type InsertFleetRolePermission = z.infer<typeof insertFleetRolePermissionSchema>;
export type FleetRolePermission = typeof fleetRolePermissions.$inferSelect;

export const insertOidcGroupMappingSchema = createInsertSchema(oidcGroupMappings).omit({ id: true });
export type InsertOidcGroupMapping = z.infer<typeof insertOidcGroupMappingSchema>;
export type OidcGroupMapping = typeof oidcGroupMappings.$inferSelect;

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({ id: true });
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettings.$inferSelect;

export const insertInventoryCategorySchema = createInsertSchema(inventoryCategories).omit({ id: true });
export type InsertInventoryCategory = z.infer<typeof insertInventoryCategorySchema>;
export type InventoryCategory = typeof inventoryCategories.$inferSelect;

export const insertInventoryCategoryFieldSchema = createInsertSchema(inventoryCategoryFields).omit({ id: true });
export type InsertInventoryCategoryField = z.infer<typeof insertInventoryCategoryFieldSchema>;
export type InventoryCategoryField = typeof inventoryCategoryFields.$inferSelect;

export const insertFleetFuelTypeSchema = createInsertSchema(fleetFuelTypes).omit({ id: true });
export type InsertFleetFuelType = z.infer<typeof insertFleetFuelTypeSchema>;
export type FleetFuelType = typeof fleetFuelTypes.$inferSelect;

export const insertAssetSchema = createInsertSchema(assets, {
  year: z.coerce.number().int().min(1900).max(2100).optional().nullable(),
  displacementLiters: z.coerce.number().optional().nullable(),
  engineCylinders: z.coerce.number().int().optional().nullable(),
  acquisitionDate: z.coerce.date().optional().nullable(),
  currentMeter: z.coerce.number().min(0).default(0),
  meterAsOf: z.coerce.date().optional().nullable(),
}).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const insertMeterReadingSchema = createInsertSchema(meterReadings, {
  value: z.coerce.number().min(0),
  readingDate: z.coerce.date(),
}).omit({ id: true });
export type InsertMeterReading = z.infer<typeof insertMeterReadingSchema>;
export type MeterReading = typeof meterReadings.$inferSelect;

export const insertMaintenanceScheduleSchema = z.object({
  scope: z.enum(["fleet", "asset"]).default("asset"),
  fleetId: z.coerce.number().int().optional().nullable(),
  assetId: z.coerce.number().int().optional().nullable(),
  name: z.string().min(1),
  category: z.string().optional().nullable(),
  readingType: z.string().default("mileage"),
  meterInterval: z.coerce.number().min(0).optional().nullable(),
  dayInterval: z.coerce.number().int().min(0).optional().nullable(),
  meterDueSoon: z.coerce.number().min(0).optional().nullable(),
  dayDueSoon: z.coerce.number().int().min(0).optional().nullable(),
  appliesToAssetTypes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  active: z.boolean().default(true),
});
export type InsertMaintenanceSchedule = z.input<typeof insertMaintenanceScheduleSchema>;
export type MaintenanceSchedule = typeof maintenanceSchedules.$inferSelect;

export const insertMaintenanceScheduleAssignmentSchema = createInsertSchema(maintenanceScheduleAssignments).omit({ id: true });
export type InsertMaintenanceScheduleAssignment = z.infer<typeof insertMaintenanceScheduleAssignmentSchema>;
export type MaintenanceScheduleAssignment = typeof maintenanceScheduleAssignments.$inferSelect;

export const insertServiceFacilityTypeSchema = createInsertSchema(serviceFacilityTypes).omit({ id: true });
export type InsertServiceFacilityType = z.infer<typeof insertServiceFacilityTypeSchema>;
export type ServiceFacilityType = typeof serviceFacilityTypes.$inferSelect;

export const insertServiceFacilitySchema = createInsertSchema(serviceFacilities).omit({ id: true });
export type InsertServiceFacility = z.infer<typeof insertServiceFacilitySchema>;
export type ServiceFacility = typeof serviceFacilities.$inferSelect;

export const insertServiceEventSchema = createInsertSchema(serviceEvents, {
  performedAt: z.coerce.date(),
  meterAtService: z.coerce.number().optional().nullable(),
  cost: z.coerce.number().optional().nullable(),
}).omit({ id: true });
export type InsertServiceEvent = z.infer<typeof insertServiceEventSchema>;
export type ServiceEvent = typeof serviceEvents.$inferSelect;

export const insertServiceLineItemSchema = createInsertSchema(serviceLineItems, {
  quantity: z.coerce.number().min(0).default(1),
  unitCost: z.coerce.number().optional().nullable(),
}).omit({ id: true });
export type InsertServiceLineItem = z.infer<typeof insertServiceLineItemSchema>;
export type ServiceLineItem = typeof serviceLineItems.$inferSelect;

export const insertInventoryItemSchema = createInsertSchema(inventoryItems, {
  onHand: z.coerce.number().default(0),
  lowStockQuantity: z.coerce.number().optional().nullable(),
  reorderPoint: z.coerce.number().optional().nullable(),
  reorderQuantity: z.coerce.number().optional().nullable(),
  unitCost: z.coerce.number().optional().nullable(),
}).omit({ id: true });
export type InsertInventoryItem = z.infer<typeof insertInventoryItemSchema>;
export type InventoryItem = typeof inventoryItems.$inferSelect;

export const insertInventoryMovementSchema = createInsertSchema(inventoryMovements, {
  occurredAt: z.coerce.date(),
  quantity: z.coerce.number(),
}).omit({ id: true });
export type InsertInventoryMovement = z.infer<typeof insertInventoryMovementSchema>;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;

export const insertAttachmentSchema = createInsertSchema(attachments, {
  createdAt: z.coerce.date(),
  size: z.coerce.number().int().min(0),
}).omit({ id: true });
export type InsertAttachment = z.infer<typeof insertAttachmentSchema>;
export type Attachment = typeof attachments.$inferSelect;

export const insertAppSettingSchema = createInsertSchema(appSettings, {
  updatedAt: z.coerce.date(),
});
export type InsertAppSetting = z.infer<typeof insertAppSettingSchema>;
export type AppSetting = typeof appSettings.$inferSelect;

// ===========================================================================
// Service-due rule shared on the wire
//
// `meter` and `day` are independent triggers — either reaching the interval
// makes the schedule due. This is the contract between the dashboard and
// the asset detail page.
// ===========================================================================

export type ScheduleStatus = "ok" | "due-soon" | "overdue" | "no-history";

export interface ScheduleComputation {
  scheduleId: number;
  status: ScheduleStatus;
  // mileage/hours math
  remainingMeter: number | null;
  // days math
  remainingDays: number | null;
  // human-friendly "next due" — meter or date the soonest interval will hit.
  triggerReason: "meter" | "day" | null;
  lastCompletedAt: number | null; // epoch ms
  lastCompletedMeter: number | null;
}

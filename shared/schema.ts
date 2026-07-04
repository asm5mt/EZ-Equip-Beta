import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// =============================================================================
// EZ-EQUIP — domain schema
//
// The shape is intentionally cloud-agnostic (no SQLite-specific types beyond
// drivers) so it can be ported to PostgreSQL/.NET later. JSON-shaped fields
// are stored as `text` and parsed at the application layer.
// =============================================================================

// ----- Fleets / sites / users / memberships --------------------------------

export const fleets = sqliteTable("fleets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  currency: text("currency").notNull().default("USD"),
  notes: text("notes"),
});

export const sites = sqliteTable("sites", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  address: text("address"),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email"),
  // local-auth simulation; AD integration will replace this layer.
  passwordHash: text("password_hash"),
  systemAdmin: integer("system_admin", { mode: "boolean" }).notNull().default(false),
});

// Role per (user, fleet). Roles: viewer | editor | admin
export const fleetMemberships = sqliteTable("fleet_memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: text("role").notNull(), // 'viewer' | 'editor' | 'admin'
});

export const fleetEquipmentTypes = sqliteTable("fleet_equipment_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("slate"),
  icon: text("icon").notNull().default("equipment"),
  defaultMeter: text("default_meter").notNull().default("mileage"),
  enableVinFeatures: integer("enable_vin_features", { mode: "boolean" }).notNull().default(false),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const fleetRoles = sqliteTable("fleet_roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  permission: text("permission").notNull().default("viewer"),
  description: text("description"),
  builtIn: integer("built_in", { mode: "boolean" }).notNull().default(false),
});

export const inventoryCategories = sqliteTable("inventory_categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  description: text("description"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const inventoryCategoryFields = sqliteTable("inventory_category_fields", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  categoryId: integer("category_id").notNull().references(() => inventoryCategories.id),
  name: text("name").notNull(),
  fieldType: text("field_type").notNull().default("text"),
  required: integer("required", { mode: "boolean" }).notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const fleetFuelTypes = sqliteTable("fleet_fuel_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  color: text("color").notNull().default("#dc2626"),
  icon: text("icon").notNull().default("fuel"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ----- Assets / equipment --------------------------------------------------

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  acquisitionDate: integer("acquisition_date", { mode: "timestamp" }),

  // Primary meter for the asset.
  // 'mileage' | 'hours' | 'count' | 'custom'
  meterType: text("meter_type").notNull().default("mileage"),
  // Free-form label when meterType = 'custom'
  meterLabel: text("meter_label"),
  currentMeter: real("current_meter").notNull().default(0),
  meterAsOf: integer("meter_as_of", { mode: "timestamp" }),

  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  inactiveReason: text("inactive_reason"),

  status: text("status").notNull().default("active"), // active | retired
  notes: text("notes"),
});

// ----- Meter readings ------------------------------------------------------

export const meterReadings = sqliteTable("meter_readings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  readingType: text("reading_type").notNull(), // mileage | hours | count | custom
  value: real("value").notNull(),
  readingDate: integer("reading_date", { mode: "timestamp" }).notNull(),
  notes: text("notes"),
  source: text("source").notNull().default("manual"), // manual | service-event
});

// ----- Maintenance schedules ----------------------------------------------
// Two distinct scopes coexist in this single table:
//   - 'fleet': shared template owned by a fleet; assigned to N assets via
//              `maintenance_schedule_assignments`. assetId is NULL.
//   - 'asset': one-off custom schedule belonging to a single asset. assetId is set.

export const maintenanceSchedules = sqliteTable("maintenance_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// Assignment of a fleet schedule to a specific asset.
export const maintenanceScheduleAssignments = sqliteTable("maintenance_schedule_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scheduleId: integer("schedule_id").notNull().references(() => maintenanceSchedules.id),
  assetId: integer("asset_id").notNull().references(() => assets.id),
});

// ----- Service events ------------------------------------------------------

export const serviceEvents = sqliteTable("service_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  scheduleId: integer("schedule_id").references(() => maintenanceSchedules.id),
  eventType: text("event_type").notNull().default("scheduled"), // scheduled | repair | unscheduled
  title: text("title").notNull(),
  performedAt: integer("performed_at", { mode: "timestamp" }).notNull(),
  meterAtService: real("meter_at_service"),
  vendor: text("vendor"),
  technician: text("technician"),
  cost: real("cost"),
  notes: text("notes"),
});

// ----- Service line items --------------------------------------------------

export const serviceLineItems = sqliteTable("service_line_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export const inventoryItems = sqliteTable("inventory_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fleetId: integer("fleet_id").notNull().references(() => fleets.id),
  name: text("name").notNull(),
  category: text("category"), // oil | filter | fluid | wiper | spark plug | grease | part | other
  sku: text("sku"),
  partNumber: text("part_number"),
  unit: text("unit").notNull().default("each"),
  onHand: real("on_hand").notNull().default(0),
  lowStockAlert: integer("low_stock_alert", { mode: "boolean" }).notNull().default(true),
  lowStockQuantity: real("low_stock_quantity"),
  reorderReminder: integer("reorder_reminder", { mode: "boolean" }).notNull().default(false),
  reorderPoint: real("reorder_point"),
  reorderQuantity: real("reorder_quantity"),
  costTracking: integer("cost_tracking", { mode: "boolean" }).notNull().default(false),
  // Compatibility flag from the early prototype. New UI uses lowStockAlert/reorderReminder.
  stocked: integer("stocked", { mode: "boolean" }).notNull().default(true),
  unitCost: real("unit_cost"),
  customFields: text("custom_fields"),
  notes: text("notes"),
});

// Stock movements provide an audit trail for adjustments and consumption.
export const inventoryMovements = sqliteTable("inventory_movements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  inventoryItemId: integer("inventory_item_id").notNull().references(() => inventoryItems.id),
  // 'adjustment' | 'consumption' | 'restock'
  movementType: text("movement_type").notNull(),
  quantity: real("quantity").notNull(), // negative for consumption, positive for restock
  serviceEventId: integer("service_event_id").references(() => serviceEvents.id),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  notes: text("notes"),
});

// ----- Attachments ---------------------------------------------------------

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // service-event | inventory-movement | inventory-item
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  dataUrl: text("data_url").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ----- App settings --------------------------------------------------------

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
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

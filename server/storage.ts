import {
  fleets,
  sites,
  users,
  fleetMemberships,
  fleetEquipmentTypes,
  fleetFuelTypes,
  fleetRoles,
  inventoryCategories,
  inventoryCategoryFields,
  assets,
  meterReadings,
  maintenanceSchedules,
  maintenanceScheduleAssignments,
  serviceEvents,
  serviceLineItems,
  inventoryItems,
  inventoryMovements,
  attachments,
  appSettings,
} from "@shared/schema";
import type {
  Fleet, InsertFleet,
  Site, InsertSite,
  User, InsertUser,
  FleetMembership, InsertFleetMembership,
  FleetEquipmentType, InsertFleetEquipmentType,
  FleetFuelType, InsertFleetFuelType,
  FleetRole, InsertFleetRole,
  InventoryCategory, InsertInventoryCategory,
  InventoryCategoryField, InsertInventoryCategoryField,
  Asset, InsertAsset,
  MeterReading, InsertMeterReading,
  MaintenanceSchedule, InsertMaintenanceSchedule,
  MaintenanceScheduleAssignment, InsertMaintenanceScheduleAssignment,
  ServiceEvent, InsertServiceEvent,
  ServiceLineItem, InsertServiceLineItem,
  InventoryItem, InsertInventoryItem,
  InventoryMovement, InsertInventoryMovement,
  Attachment, InsertAttachment,
  AppSetting, InsertAppSetting,
} from "@shared/schema";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

const dbPath = process.env.EZ_EQUIP_DB_PATH || "data.db";
const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite);

const DEFAULT_EQUIPMENT_TYPE_ROWS = [
  { name: "vehicle", color: "blue", icon: "vehicle", defaultMeter: "mileage", enableVinFeatures: true },
  { name: "generator", color: "amber", icon: "generator", defaultMeter: "hours", enableVinFeatures: false },
  { name: "trailer", color: "slate", icon: "trailer", defaultMeter: "count", enableVinFeatures: true },
  { name: "tractor", color: "green", icon: "tractor", defaultMeter: "hours", enableVinFeatures: true },
  { name: "atv", color: "orange", icon: "atv", defaultMeter: "mileage", enableVinFeatures: true },
  { name: "snowmobile", color: "cyan", icon: "snowmobile", defaultMeter: "mileage", enableVinFeatures: true },
  { name: "lawn", color: "lime", icon: "lawn", defaultMeter: "hours", enableVinFeatures: false },
  { name: "equipment", color: "purple", icon: "equipment", defaultMeter: "custom", enableVinFeatures: false },
];

const DEFAULT_FUEL_TYPE_ROWS = [
  { name: "Gasoline", color: "#dc2626", icon: "fuel", active: true },
  { name: "Diesel", color: "#d97706", icon: "fuel", active: true },
  { name: "Electric", color: "#16a34a", icon: "zap", active: true },
  { name: "Hybrid", color: "#0d9488", icon: "zap", active: true },
  { name: "CNG", color: "#2563eb", icon: "wind", active: true },
  { name: "Propane / LPG", color: "#ea580c", icon: "flame", active: true },
  { name: "Hydrogen", color: "#7c3aed", icon: "atom", active: true },
  { name: "E85 / Flex Fuel", color: "#ca8a04", icon: "leaf", active: true },
];

const DEFAULT_FLEET_ROLE_ROWS = [
  { name: "viewer", permission: "viewer", description: "Can view dashboards, assets, service history, meters, inventory, and reports. Cannot edit.", builtIn: true },
  { name: "editor", permission: "editor", description: "Can add and update assets, meters, services, schedules, and inventory.", builtIn: true },
  { name: "admin", permission: "admin", description: "Can manage fleet settings, users, memberships, and all editor workflows.", builtIn: true },
];

function rolePermissionForFleet(fleetId: number, roleName: string): "viewer" | "editor" | "admin" {
  const configured = db.select().from(fleetRoles)
    .where(and(eq(fleetRoles.fleetId, fleetId), eq(fleetRoles.name, roleName)))
    .get();
  const permission = configured?.permission ?? roleName;
  return permission === "admin" || permission === "editor" || permission === "viewer" ? permission : "viewer";
}

function isAdminRoleForFleet(fleetId: number, roleName: string): boolean {
  return rolePermissionForFleet(fleetId, roleName) === "admin";
}

function countFleetAdmins(fleetId: number, excludeMembershipId?: number, excludeUserId?: number): number {
  return db.select().from(fleetMemberships)
    .where(eq(fleetMemberships.fleetId, fleetId))
    .all()
    .filter(m => m.id !== excludeMembershipId && m.userId !== excludeUserId)
    .filter(m => isAdminRoleForFleet(fleetId, m.role))
    .length;
}

function assertFleetKeepsAdmin(fleetId: number, excludeMembershipId?: number, excludeUserId?: number) {
  if (countFleetAdmins(fleetId, excludeMembershipId, excludeUserId) === 0) {
    throw new Error("cannot_remove_last_fleet_admin");
  }
}

function ensureEveryFleetHasAdmin() {
  for (const fleet of db.select().from(fleets).all()) {
    if (countFleetAdmins(fleet.id) > 0) continue;
    const firstMembership = db.select().from(fleetMemberships)
      .where(eq(fleetMemberships.fleetId, fleet.id))
      .orderBy(fleetMemberships.id)
      .get();
    if (firstMembership) {
      db.update(fleetMemberships).set({ role: "admin" })
        .where(eq(fleetMemberships.id, firstMembership.id))
        .run();
      continue;
    }
    const firstUser = db.select().from(users).orderBy(users.id).get() ??
      db.insert(users).values({
        username: "fleet-admin",
        displayName: "Fleet Admin",
        email: null,
        passwordHash: null,
        systemAdmin: true,
      }).returning().get();
    db.insert(fleetMemberships).values({ fleetId: fleet.id, userId: firstUser.id, role: "admin" }).run();
  }
}

// ---- Schema bootstrap (idempotent) ----------------------------------------
// We apply CREATE TABLE IF NOT EXISTS at startup so that the SQLite-backed
// dev/Docker run works without `drizzle-kit push`. PostgreSQL deployments
// would replace this with a proper migration step.
function ensureSchema() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS fleets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'USD',
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      address TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      email TEXT,
      password_hash TEXT,
      system_admin INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS fleet_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS fleet_equipment_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT 'slate',
      icon TEXT NOT NULL DEFAULT 'equipment',
      default_meter TEXT NOT NULL DEFAULT 'mileage',
      enable_vin_features INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS fleet_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'viewer',
      description TEXT,
      built_in INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_category_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text',
      required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS fleet_fuel_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#dc2626',
      icon TEXT NOT NULL DEFAULT 'fuel',
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      site_id INTEGER,
      friendly_name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      year INTEGER,
      make TEXT,
      model TEXT,
      trim TEXT,
      vin TEXT,
      serial TEXT,
      plate_jurisdiction TEXT,
      plate_number TEXT,
      engine TEXT,
      transmission TEXT,
      drivetrain TEXT,
      fuel_type TEXT,
      displacement_liters REAL,
      engine_cylinders INTEGER,
      engine_configuration TEXT,
      gvwr TEXT,
      body_type TEXT,
      vin_decoded_fields TEXT,
      acquisition_date INTEGER,
      meter_type TEXT NOT NULL DEFAULT 'mileage',
      meter_label TEXT,
      current_meter REAL NOT NULL DEFAULT 0,
      meter_as_of INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      inactive_reason TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS meter_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      reading_type TEXT NOT NULL,
      value REAL NOT NULL,
      reading_date INTEGER NOT NULL,
      notes TEXT,
      source TEXT NOT NULL DEFAULT 'manual'
    )`,
    `CREATE TABLE IF NOT EXISTS maintenance_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL DEFAULT 'asset',
      fleet_id INTEGER,
      asset_id INTEGER,
      name TEXT NOT NULL,
      category TEXT,
      reading_type TEXT NOT NULL DEFAULT 'mileage',
      meter_interval REAL,
      day_interval INTEGER,
      meter_due_soon REAL,
      day_due_soon INTEGER,
      applies_to_asset_types TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS maintenance_schedule_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      schedule_id INTEGER NOT NULL,
      asset_id INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS service_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      schedule_id INTEGER,
      event_type TEXT NOT NULL DEFAULT 'scheduled',
      title TEXT NOT NULL,
      performed_at INTEGER NOT NULL,
      meter_at_service REAL,
      vendor TEXT,
      technician TEXT,
      cost REAL,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS service_line_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_event_id INTEGER NOT NULL,
      inventory_item_id INTEGER,
      item_name TEXT NOT NULL,
      part_number TEXT,
      brand TEXT,
      spec TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT,
      unit_cost REAL,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fleet_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      sku TEXT,
      part_number TEXT,
      unit TEXT NOT NULL DEFAULT 'each',
      on_hand REAL NOT NULL DEFAULT 0,
      low_stock_alert INTEGER NOT NULL DEFAULT 1,
      low_stock_quantity REAL,
      reorder_reminder INTEGER NOT NULL DEFAULT 0,
      reorder_point REAL,
      reorder_quantity REAL,
      cost_tracking INTEGER NOT NULL DEFAULT 0,
      stocked INTEGER NOT NULL DEFAULT 1,
      unit_cost REAL,
      custom_fields TEXT,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      service_event_id INTEGER,
      occurred_at INTEGER NOT NULL,
      notes TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size INTEGER NOT NULL,
      data_url TEXT NOT NULL,
      notes TEXT,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
  ];
  for (const stmt of stmts) sqlite.exec(stmt);
  const columns = sqlite.prepare(`PRAGMA table_info(assets)`).all() as Array<{ name: string }>;
  if (!columns.some(c => c.name === "acquisition_date")) {
    sqlite.exec(`ALTER TABLE assets ADD COLUMN acquisition_date INTEGER`);
  }
  if (!columns.some(c => c.name === "plate_jurisdiction")) {
    sqlite.exec(`ALTER TABLE assets ADD COLUMN plate_jurisdiction TEXT`);
  }
  if (!columns.some(c => c.name === "plate_number")) {
    sqlite.exec(`ALTER TABLE assets ADD COLUMN plate_number TEXT`);
  }
  const assetColumnAdds: Array<[string, string]> = [
    ["fuel_type", "TEXT"],
    ["displacement_liters", "REAL"],
    ["engine_cylinders", "INTEGER"],
    ["engine_configuration", "TEXT"],
    ["gvwr", "TEXT"],
    ["body_type", "TEXT"],
    ["vin_decoded_fields", "TEXT"],
    ["is_active", "INTEGER NOT NULL DEFAULT 1"],
    ["inactive_reason", "TEXT"],
  ];
  for (const [name, ddl] of assetColumnAdds) {
    if (!columns.some(c => c.name === name)) {
      sqlite.exec(`ALTER TABLE assets ADD COLUMN ${name} ${ddl}`);
    }
  }
  const equipmentTypeColumns = sqlite.prepare(`PRAGMA table_info(fleet_equipment_types)`).all() as Array<{ name: string }>;
  if (!equipmentTypeColumns.some(c => c.name === "icon")) {
    sqlite.exec(`ALTER TABLE fleet_equipment_types ADD COLUMN icon TEXT NOT NULL DEFAULT 'equipment'`);
    sqlite.exec(`
      UPDATE fleet_equipment_types
      SET icon = CASE lower(name)
        WHEN 'vehicle' THEN 'vehicle'
        WHEN 'truck' THEN 'truck'
        WHEN 'generator' THEN 'generator'
        WHEN 'trailer' THEN 'trailer'
        WHEN 'tractor' THEN 'tractor'
        WHEN 'atv' THEN 'atv'
        WHEN 'utv' THEN 'atv'
        WHEN 'snowmobile' THEN 'snowmobile'
        WHEN 'lawn' THEN 'lawn'
        ELSE 'equipment'
      END
    `);
  }
  if (!equipmentTypeColumns.some(c => c.name === "enable_vin_features")) {
    sqlite.exec(`ALTER TABLE fleet_equipment_types ADD COLUMN enable_vin_features INTEGER NOT NULL DEFAULT 0`);
    sqlite.exec(`
      UPDATE fleet_equipment_types
      SET enable_vin_features = CASE lower(name)
        WHEN 'vehicle' THEN 1
        WHEN 'truck' THEN 1
        WHEN 'tractor' THEN 1
        WHEN 'trailer' THEN 1
        WHEN 'atv' THEN 1
        WHEN 'utv' THEN 1
        WHEN 'snowmobile' THEN 1
        ELSE 0
      END
    `);
  }
  const fleetColumns = sqlite.prepare(`PRAGMA table_info(fleets)`).all() as Array<{ name: string }>;
  if (!fleetColumns.some(c => c.name === "currency")) {
    sqlite.exec(`ALTER TABLE fleets ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'`);
  }
  const inventoryColumns = sqlite.prepare(`PRAGMA table_info(inventory_items)`).all() as Array<{ name: string }>;
  const hasInventoryColumn = (name: string) => inventoryColumns.some(c => c.name === name);
  if (!hasInventoryColumn("low_stock_alert")) {
    sqlite.exec(`ALTER TABLE inventory_items ADD COLUMN low_stock_alert INTEGER NOT NULL DEFAULT 1`);
    sqlite.exec(`UPDATE inventory_items SET low_stock_alert = stocked`);
  }
  if (!hasInventoryColumn("low_stock_quantity")) {
    sqlite.exec(`ALTER TABLE inventory_items ADD COLUMN low_stock_quantity REAL`);
    sqlite.exec(`UPDATE inventory_items SET low_stock_quantity = reorder_point WHERE reorder_point IS NOT NULL`);
  }
  if (!hasInventoryColumn("reorder_reminder")) {
    sqlite.exec(`ALTER TABLE inventory_items ADD COLUMN reorder_reminder INTEGER NOT NULL DEFAULT 0`);
    sqlite.exec(`UPDATE inventory_items SET reorder_reminder = stocked WHERE reorder_point IS NOT NULL`);
  }
  if (!hasInventoryColumn("cost_tracking")) {
    sqlite.exec(`ALTER TABLE inventory_items ADD COLUMN cost_tracking INTEGER NOT NULL DEFAULT 0`);
    sqlite.exec(`UPDATE inventory_items SET cost_tracking = 1 WHERE unit_cost IS NOT NULL`);
  }
  if (!hasInventoryColumn("custom_fields")) {
    sqlite.exec(`ALTER TABLE inventory_items ADD COLUMN custom_fields TEXT`);
  }
  // Maintenance schedules: add scope/fleet_id/applies_to_asset_types if pre-existing DB lacks them.
  const scheduleColumns = sqlite.prepare(`PRAGMA table_info(maintenance_schedules)`).all() as Array<{ name: string; notnull: number }>;
  const hasSchedColumn = (name: string) => scheduleColumns.some(c => c.name === name);
  if (!hasSchedColumn("scope")) {
    sqlite.exec(`ALTER TABLE maintenance_schedules ADD COLUMN scope TEXT NOT NULL DEFAULT 'asset'`);
    // Existing rows become custom asset schedules.
    sqlite.exec(`UPDATE maintenance_schedules SET scope = 'asset'`);
  }
  if (!hasSchedColumn("fleet_id")) {
    sqlite.exec(`ALTER TABLE maintenance_schedules ADD COLUMN fleet_id INTEGER`);
    // Backfill fleet_id from the asset.fleet_id where applicable.
    sqlite.exec(`UPDATE maintenance_schedules SET fleet_id = (SELECT a.fleet_id FROM assets a WHERE a.id = maintenance_schedules.asset_id) WHERE asset_id IS NOT NULL`);
  }
  if (!hasSchedColumn("applies_to_asset_types")) {
    sqlite.exec(`ALTER TABLE maintenance_schedules ADD COLUMN applies_to_asset_types TEXT`);
  }
  // Pre-existing tables had asset_id NOT NULL. Fleet-scoped schedules need it nullable.
  // SQLite cannot drop NOT NULL via ALTER, so rebuild the table preserving rows.
  const assetIdCol = scheduleColumns.find(c => c.name === "asset_id");
  if (assetIdCol && assetIdCol.notnull === 1) {
    sqlite.exec(`
      BEGIN TRANSACTION;
      CREATE TABLE maintenance_schedules__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL DEFAULT 'asset',
        fleet_id INTEGER,
        asset_id INTEGER,
        name TEXT NOT NULL,
        category TEXT,
        reading_type TEXT NOT NULL DEFAULT 'mileage',
        meter_interval REAL,
        day_interval INTEGER,
        meter_due_soon REAL,
        day_due_soon INTEGER,
        applies_to_asset_types TEXT,
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1
      );
      INSERT INTO maintenance_schedules__new
        (id, scope, fleet_id, asset_id, name, category, reading_type,
         meter_interval, day_interval, meter_due_soon, day_due_soon,
         applies_to_asset_types, notes, active)
      SELECT
        id,
        COALESCE(scope, 'asset'),
        fleet_id,
        asset_id,
        name,
        category,
        reading_type,
        meter_interval,
        day_interval,
        meter_due_soon,
        day_due_soon,
        applies_to_asset_types,
        notes,
        active
      FROM maintenance_schedules;
      DROP TABLE maintenance_schedules;
      ALTER TABLE maintenance_schedules__new RENAME TO maintenance_schedules;
      COMMIT;
    `);
  }
}
ensureSchema();

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface IStorage {
  // fleets / sites
  listFleets(): Fleet[];
  getFleet(id: number): Fleet | undefined;
  updateFleet(id: number, input: Partial<InsertFleet>): Fleet | undefined;
  createFleet(input: InsertFleet): Fleet;

  listSites(fleetId: number): Site[];
  createSite(input: InsertSite): Site;

  // users / memberships
  listUsers(): User[];
  createUser(input: InsertUser): User;
  deleteUser(id: number): boolean;
  listFleetMemberships(): FleetMembership[];
  upsertFleetMembership(input: InsertFleetMembership): FleetMembership;
  deleteFleetMembership(fleetId: number, userId: number): boolean;
  listFleetEquipmentTypes(fleetId?: number): FleetEquipmentType[];
  createFleetEquipmentType(input: InsertFleetEquipmentType): FleetEquipmentType;
  updateFleetEquipmentType(id: number, input: Partial<InsertFleetEquipmentType>): FleetEquipmentType | undefined;
  deleteFleetEquipmentType(id: number): boolean;
  listFleetFuelTypes(fleetId?: number): FleetFuelType[];
  createFleetFuelType(input: InsertFleetFuelType): FleetFuelType;
  updateFleetFuelType(id: number, input: Partial<InsertFleetFuelType>): FleetFuelType | undefined;
  deleteFleetFuelType(id: number): boolean;
  listFleetRoles(fleetId?: number): FleetRole[];
  createFleetRole(input: InsertFleetRole): FleetRole;
  updateFleetRole(id: number, input: Partial<InsertFleetRole>): FleetRole | undefined;
  deleteFleetRole(id: number): boolean;
  listInventoryCategories(fleetId?: number): InventoryCategory[];
  createInventoryCategory(input: InsertInventoryCategory): InventoryCategory;
  updateInventoryCategory(id: number, input: Partial<InsertInventoryCategory>): InventoryCategory | undefined;
  deleteInventoryCategory(id: number): boolean;
  listInventoryCategoryFields(categoryId?: number): InventoryCategoryField[];
  createInventoryCategoryField(input: InsertInventoryCategoryField): InventoryCategoryField;
  updateInventoryCategoryField(id: number, input: Partial<InsertInventoryCategoryField>): InventoryCategoryField | undefined;
  deleteInventoryCategoryField(id: number): boolean;

  // assets
  listAssets(fleetId?: number): Asset[];
  getAsset(id: number): Asset | undefined;
  createAsset(input: InsertAsset): Asset;
  updateAsset(id: number, input: Partial<InsertAsset>): Asset | undefined;
  deleteAsset(id: number): boolean;

  // meter readings
  listMeterReadings(assetId?: number): MeterReading[];
  getMeterReading(id: number): MeterReading | undefined;
  createMeterReading(input: InsertMeterReading): MeterReading;
  updateMeterReading(id: number, input: Partial<InsertMeterReading>): MeterReading | undefined;
  deleteMeterReading(id: number): boolean;

  // schedules
  listSchedules(assetId?: number): MaintenanceSchedule[];
  listAllSchedulesForFleet(fleetId: number): MaintenanceSchedule[];
  listSchedulesAssignedToAsset(assetId: number): MaintenanceSchedule[];
  getSchedule(id: number): MaintenanceSchedule | undefined;
  createSchedule(input: InsertMaintenanceSchedule): MaintenanceSchedule;
  updateSchedule(id: number, input: Partial<InsertMaintenanceSchedule>): MaintenanceSchedule | undefined;
  deleteSchedule(id: number): boolean;
  listScheduleAssignments(scheduleId?: number): MaintenanceScheduleAssignment[];
  setScheduleAssignments(scheduleId: number, assetIds: number[]): MaintenanceScheduleAssignment[];
  promoteScheduleToFleet(scheduleId: number, additionalAssetIds: number[]): MaintenanceSchedule;

  // service events
  listServiceEvents(assetId?: number): ServiceEvent[];
  getServiceEvent(id: number): ServiceEvent | undefined;
  createServiceEvent(input: InsertServiceEvent): ServiceEvent;
  updateServiceEvent(id: number, input: Partial<InsertServiceEvent>): ServiceEvent | undefined;
  deleteServiceEvent(id: number): boolean;
  listLineItems(serviceEventId?: number): ServiceLineItem[];
  createLineItem(input: InsertServiceLineItem): ServiceLineItem;
  replaceLineItems(serviceEventId: number, input: InsertServiceLineItem[]): ServiceLineItem[];

  // inventory
  listInventoryItems(fleetId?: number): InventoryItem[];
  getInventoryItem(id: number): InventoryItem | undefined;
  createInventoryItem(input: InsertInventoryItem): InventoryItem;
  updateInventoryItem(id: number, input: Partial<InsertInventoryItem>): InventoryItem | undefined;
  deleteInventoryItem(id: number): boolean;
  listInventoryMovements(itemId?: number): InventoryMovement[];
  createInventoryMovement(input: InsertInventoryMovement): InventoryMovement;

  // attachments
  listAttachments(entityType?: string, entityId?: number): Attachment[];
  createAttachment(input: InsertAttachment): Attachment;

  // settings
  listAppSettings(): AppSetting[];
  upsertAppSetting(input: InsertAppSetting): AppSetting;
}

export class DatabaseStorage implements IStorage {
  // -- fleets ----
  listFleets(): Fleet[] { return db.select().from(fleets).orderBy(asc(fleets.id)).all(); }
  getFleet(id: number): Fleet | undefined { return db.select().from(fleets).where(eq(fleets.id, id)).get(); }
  updateFleet(id: number, input: Partial<InsertFleet>): Fleet | undefined {
    return db.update(fleets).set(input).where(eq(fleets.id, id)).returning().get();
  }
  createFleet(input: InsertFleet): Fleet {
    const fleet = db.insert(fleets).values(input).returning().get();
    for (const role of DEFAULT_FLEET_ROLE_ROWS) {
      db.insert(fleetRoles).values({ fleetId: fleet.id, ...role }).run();
    }
    for (const fuel of DEFAULT_FUEL_TYPE_ROWS) {
      db.insert(fleetFuelTypes).values({ fleetId: fleet.id, ...fuel }).run();
    }
    return fleet;
  }

  listSites(fleetId: number): Site[] {
    return db.select().from(sites).where(eq(sites.fleetId, fleetId)).all();
  }
  createSite(input: InsertSite): Site { return db.insert(sites).values(input).returning().get(); }

  // -- users / memberships ----
  listUsers(): User[] { return db.select().from(users).orderBy(users.displayName).all(); }
  createUser(input: InsertUser): User { return db.insert(users).values(input).returning().get(); }
  deleteUser(id: number): boolean {
    const memberships = db.select().from(fleetMemberships).where(eq(fleetMemberships.userId, id)).all();
    for (const membership of memberships) {
      if (isAdminRoleForFleet(membership.fleetId, membership.role)) {
        assertFleetKeepsAdmin(membership.fleetId, undefined, id);
      }
    }
    db.delete(fleetMemberships).where(eq(fleetMemberships.userId, id)).run();
    return db.delete(users).where(eq(users.id, id)).run().changes > 0;
  }
  listFleetMemberships(): FleetMembership[] { return db.select().from(fleetMemberships).all(); }
  upsertFleetMembership(input: InsertFleetMembership): FleetMembership {
    const existing = db.select().from(fleetMemberships)
      .where(and(eq(fleetMemberships.fleetId, input.fleetId), eq(fleetMemberships.userId, input.userId)))
      .get();
    if (existing) {
      if (isAdminRoleForFleet(existing.fleetId, existing.role) && !isAdminRoleForFleet(input.fleetId, input.role)) {
        assertFleetKeepsAdmin(existing.fleetId, existing.id);
      }
      return db.update(fleetMemberships).set({ role: input.role })
        .where(eq(fleetMemberships.id, existing.id)).returning().get();
    }
    return db.insert(fleetMemberships).values(input).returning().get();
  }
  deleteFleetMembership(fleetId: number, userId: number): boolean {
    const existing = db.select().from(fleetMemberships)
      .where(and(eq(fleetMemberships.fleetId, fleetId), eq(fleetMemberships.userId, userId)))
      .get();
    if (existing && isAdminRoleForFleet(fleetId, existing.role)) {
      assertFleetKeepsAdmin(fleetId, existing.id);
    }
    return db.delete(fleetMemberships)
      .where(and(eq(fleetMemberships.fleetId, fleetId), eq(fleetMemberships.userId, userId)))
      .run().changes > 0;
  }
  listFleetEquipmentTypes(fleetId?: number): FleetEquipmentType[] {
    const q = db.select().from(fleetEquipmentTypes).orderBy(fleetEquipmentTypes.name);
    return fleetId ? q.where(eq(fleetEquipmentTypes.fleetId, fleetId)).all() : q.all();
  }
  createFleetEquipmentType(input: InsertFleetEquipmentType): FleetEquipmentType {
    return db.insert(fleetEquipmentTypes).values(input).returning().get();
  }
  updateFleetEquipmentType(id: number, input: Partial<InsertFleetEquipmentType>): FleetEquipmentType | undefined {
    return db.update(fleetEquipmentTypes).set(input).where(eq(fleetEquipmentTypes.id, id)).returning().get();
  }
  deleteFleetEquipmentType(id: number): boolean {
    return db.delete(fleetEquipmentTypes).where(eq(fleetEquipmentTypes.id, id)).run().changes > 0;
  }
  listFleetFuelTypes(fleetId?: number): FleetFuelType[] {
    if (fleetId) {
      const existing = db.select().from(fleetFuelTypes).where(eq(fleetFuelTypes.fleetId, fleetId)).all();
      if (existing.length === 0) {
        for (const fuel of DEFAULT_FUEL_TYPE_ROWS) {
          db.insert(fleetFuelTypes).values({ fleetId, ...fuel }).run();
        }
      }
    }
    const q = db.select().from(fleetFuelTypes).orderBy(fleetFuelTypes.name);
    return fleetId ? q.where(eq(fleetFuelTypes.fleetId, fleetId)).all() : q.all();
  }
  createFleetFuelType(input: InsertFleetFuelType): FleetFuelType {
    return db.insert(fleetFuelTypes).values(input).returning().get();
  }
  updateFleetFuelType(id: number, input: Partial<InsertFleetFuelType>): FleetFuelType | undefined {
    return db.update(fleetFuelTypes).set(input).where(eq(fleetFuelTypes.id, id)).returning().get();
  }
  deleteFleetFuelType(id: number): boolean {
    return db.delete(fleetFuelTypes).where(eq(fleetFuelTypes.id, id)).run().changes > 0;
  }
  listFleetRoles(fleetId?: number): FleetRole[] {
    if (fleetId) {
      const existing = db.select().from(fleetRoles).where(eq(fleetRoles.fleetId, fleetId)).all();
      if (existing.length === 0) {
        for (const role of DEFAULT_FLEET_ROLE_ROWS) {
          db.insert(fleetRoles).values({ fleetId, ...role }).run();
        }
      }
    }
    const q = db.select().from(fleetRoles).orderBy(fleetRoles.name);
    return fleetId ? q.where(eq(fleetRoles.fleetId, fleetId)).all() : q.all();
  }
  createFleetRole(input: InsertFleetRole): FleetRole {
    return db.insert(fleetRoles).values(input).returning().get();
  }
  updateFleetRole(id: number, input: Partial<InsertFleetRole>): FleetRole | undefined {
    const existing = db.select().from(fleetRoles).where(eq(fleetRoles.id, id)).get();
    if (existing && existing.permission === "admin" && input.permission && input.permission !== "admin") {
      const adminMembershipsForRole = db.select().from(fleetMemberships)
        .where(and(eq(fleetMemberships.fleetId, existing.fleetId), eq(fleetMemberships.role, existing.name)))
        .all();
      const otherAdminCount = db.select().from(fleetMemberships)
        .where(and(eq(fleetMemberships.fleetId, existing.fleetId), ne(fleetMemberships.role, existing.name)))
        .all()
        .filter(m => isAdminRoleForFleet(existing.fleetId, m.role))
        .length;
      if (adminMembershipsForRole.length > 0 && otherAdminCount === 0) {
        throw new Error("cannot_remove_last_fleet_admin");
      }
    }
    return db.update(fleetRoles).set(input).where(eq(fleetRoles.id, id)).returning().get();
  }
  deleteFleetRole(id: number): boolean {
    const existing = db.select().from(fleetRoles).where(eq(fleetRoles.id, id)).get();
    if (existing && existing.permission === "admin") {
      const adminMembershipsForRole = db.select().from(fleetMemberships)
        .where(and(eq(fleetMemberships.fleetId, existing.fleetId), eq(fleetMemberships.role, existing.name)))
        .all();
      const otherAdminCount = db.select().from(fleetMemberships)
        .where(and(eq(fleetMemberships.fleetId, existing.fleetId), ne(fleetMemberships.role, existing.name)))
        .all()
        .filter(m => isAdminRoleForFleet(existing.fleetId, m.role))
        .length;
      if (adminMembershipsForRole.length > 0 && otherAdminCount === 0) {
        throw new Error("cannot_remove_last_fleet_admin");
      }
    }
    return db.delete(fleetRoles).where(eq(fleetRoles.id, id)).run().changes > 0;
  }

  listInventoryCategories(fleetId?: number): InventoryCategory[] {
    const q = db.select().from(inventoryCategories).orderBy(inventoryCategories.name);
    return fleetId ? q.where(eq(inventoryCategories.fleetId, fleetId)).all() : q.all();
  }
  createInventoryCategory(input: InsertInventoryCategory): InventoryCategory {
    return db.insert(inventoryCategories).values(input).returning().get();
  }
  updateInventoryCategory(id: number, input: Partial<InsertInventoryCategory>): InventoryCategory | undefined {
    return db.update(inventoryCategories).set(input).where(eq(inventoryCategories.id, id)).returning().get();
  }
  deleteInventoryCategory(id: number): boolean {
    db.delete(inventoryCategoryFields).where(eq(inventoryCategoryFields.categoryId, id)).run();
    return db.delete(inventoryCategories).where(eq(inventoryCategories.id, id)).run().changes > 0;
  }
  listInventoryCategoryFields(categoryId?: number): InventoryCategoryField[] {
    const q = db.select().from(inventoryCategoryFields).orderBy(inventoryCategoryFields.sortOrder, inventoryCategoryFields.name);
    return categoryId ? q.where(eq(inventoryCategoryFields.categoryId, categoryId)).all() : q.all();
  }
  createInventoryCategoryField(input: InsertInventoryCategoryField): InventoryCategoryField {
    return db.insert(inventoryCategoryFields).values(input).returning().get();
  }
  updateInventoryCategoryField(id: number, input: Partial<InsertInventoryCategoryField>): InventoryCategoryField | undefined {
    return db.update(inventoryCategoryFields).set(input).where(eq(inventoryCategoryFields.id, id)).returning().get();
  }
  deleteInventoryCategoryField(id: number): boolean {
    return db.delete(inventoryCategoryFields).where(eq(inventoryCategoryFields.id, id)).run().changes > 0;
  }

  // -- assets ----
  listAssets(fleetId?: number): Asset[] {
    const q = db.select().from(assets).orderBy(assets.friendlyName);
    return fleetId ? q.where(eq(assets.fleetId, fleetId)).all() : q.all();
  }
  getAsset(id: number): Asset | undefined { return db.select().from(assets).where(eq(assets.id, id)).get(); }
  createAsset(input: InsertAsset): Asset { return db.insert(assets).values(input).returning().get(); }
  updateAsset(id: number, input: Partial<InsertAsset>): Asset | undefined {
    return db.update(assets).set(input).where(eq(assets.id, id)).returning().get();
  }
  deleteAsset(id: number): boolean {
    return db.delete(assets).where(eq(assets.id, id)).run().changes > 0;
  }

  // -- meter readings ----
  listMeterReadings(assetId?: number): MeterReading[] {
    const q = db.select().from(meterReadings).orderBy(desc(meterReadings.readingDate));
    return assetId ? q.where(eq(meterReadings.assetId, assetId)).all() : q.all();
  }
  getMeterReading(id: number): MeterReading | undefined {
    return db.select().from(meterReadings).where(eq(meterReadings.id, id)).get();
  }
  updateMeterReading(id: number, input: Partial<InsertMeterReading>): MeterReading | undefined {
    const updated = db.update(meterReadings).set(input).where(eq(meterReadings.id, id)).returning().get();
    if (updated) this.refreshAssetMeterFromReadings(updated.assetId);
    return updated;
  }
  deleteMeterReading(id: number): boolean {
    const existing = this.getMeterReading(id);
    const removed = db.delete(meterReadings).where(eq(meterReadings.id, id)).run().changes > 0;
    if (removed && existing) this.refreshAssetMeterFromReadings(existing.assetId);
    return removed;
  }
  private refreshAssetMeterFromReadings(assetId: number) {
    const asset = this.getAsset(assetId);
    if (!asset) return;
    // Find most recent remaining reading; if none, leave as-is.
    const latest = db.select().from(meterReadings)
      .where(eq(meterReadings.assetId, assetId))
      .orderBy(desc(meterReadings.readingDate))
      .limit(1).get();
    if (latest) {
      db.update(assets)
        .set({ currentMeter: latest.value, meterAsOf: latest.readingDate, meterType: latest.readingType })
        .where(eq(assets.id, assetId)).run();
    }
  }
  createMeterReading(input: InsertMeterReading): MeterReading {
    const reading = db.insert(meterReadings).values(input).returning().get();
    // Bump asset.currentMeter if newer/higher.
    const asset = this.getAsset(input.assetId);
    if (asset) {
      const incomingDate = new Date(input.readingDate).getTime();
      const existingDate = asset.meterAsOf ? new Date(asset.meterAsOf).getTime() : 0;
      if (input.value >= asset.currentMeter || incomingDate >= existingDate) {
        db.update(assets)
          .set({ currentMeter: input.value, meterAsOf: input.readingDate, meterType: input.readingType })
          .where(eq(assets.id, asset.id)).run();
      }
    }
    return reading;
  }

  // -- schedules ----
  //
  // listSchedules(assetId) returns the *effective* list of schedules visible
  // on an asset detail page: asset-scoped rows whose assetId === assetId,
  // plus fleet-scoped rows assigned to assetId via the assignments table.
  listSchedules(assetId?: number): MaintenanceSchedule[] {
    if (assetId == null) {
      return db.select().from(maintenanceSchedules).orderBy(maintenanceSchedules.name).all();
    }
    return this.listSchedulesAssignedToAsset(assetId);
  }
  listSchedulesAssignedToAsset(assetId: number): MaintenanceSchedule[] {
    const ownRows = db.select().from(maintenanceSchedules)
      .where(and(eq(maintenanceSchedules.assetId, assetId), eq(maintenanceSchedules.scope, "asset")))
      .all();
    const assignedRows = db.select({ s: maintenanceSchedules })
      .from(maintenanceScheduleAssignments)
      .innerJoin(maintenanceSchedules, eq(maintenanceSchedules.id, maintenanceScheduleAssignments.scheduleId))
      .where(eq(maintenanceScheduleAssignments.assetId, assetId))
      .all()
      .map(r => r.s);
    const seen = new Set<number>();
    const out: MaintenanceSchedule[] = [];
    for (const row of [...ownRows, ...assignedRows]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
  listAllSchedulesForFleet(fleetId: number): MaintenanceSchedule[] {
    return db.select().from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.fleetId, fleetId))
      .orderBy(maintenanceSchedules.name).all();
  }
  getSchedule(id: number): MaintenanceSchedule | undefined {
    return db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.id, id)).get();
  }
  createSchedule(input: InsertMaintenanceSchedule): MaintenanceSchedule {
    const scope = input.scope ?? "asset";
    // For asset schedules, derive fleetId from the asset for consistency.
    let fleetId = input.fleetId ?? null;
    if (scope === "asset" && input.assetId && fleetId == null) {
      const asset = this.getAsset(input.assetId);
      fleetId = asset?.fleetId ?? null;
    }
    const values = {
      ...input,
      scope,
      fleetId,
      // Fleet schedules have no single assetId.
      assetId: scope === "fleet" ? null : input.assetId ?? null,
    } as InsertMaintenanceSchedule;
    return db.insert(maintenanceSchedules).values(values).returning().get();
  }
  updateSchedule(id: number, input: Partial<InsertMaintenanceSchedule>): MaintenanceSchedule | undefined {
    return db.update(maintenanceSchedules).set(input).where(eq(maintenanceSchedules.id, id)).returning().get();
  }
  deleteSchedule(id: number): boolean {
    // Cascade: remove assignments for this schedule.
    db.delete(maintenanceScheduleAssignments).where(eq(maintenanceScheduleAssignments.scheduleId, id)).run();
    return db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, id)).run().changes > 0;
  }

  listScheduleAssignments(scheduleId?: number): MaintenanceScheduleAssignment[] {
    const q = db.select().from(maintenanceScheduleAssignments);
    return scheduleId ? q.where(eq(maintenanceScheduleAssignments.scheduleId, scheduleId)).all() : q.all();
  }
  setScheduleAssignments(scheduleId: number, assetIds: number[]): MaintenanceScheduleAssignment[] {
    // Replace assignments wholesale (idempotent).
    db.delete(maintenanceScheduleAssignments).where(eq(maintenanceScheduleAssignments.scheduleId, scheduleId)).run();
    const unique = Array.from(new Set(assetIds.filter(id => Number.isFinite(id))));
    for (const assetId of unique) {
      db.insert(maintenanceScheduleAssignments).values({ scheduleId, assetId }).run();
    }
    return this.listScheduleAssignments(scheduleId);
  }
  promoteScheduleToFleet(scheduleId: number, additionalAssetIds: number[]): MaintenanceSchedule {
    const existing = this.getSchedule(scheduleId);
    if (!existing) throw new Error("schedule_not_found");
    if (existing.scope === "fleet") return existing;
    const originatingAsset = existing.assetId;
    let fleetId = existing.fleetId;
    if (!fleetId && originatingAsset) {
      const a = this.getAsset(originatingAsset);
      fleetId = a?.fleetId ?? null;
    }
    // Convert the row in-place to a fleet schedule.
    db.update(maintenanceSchedules).set({ scope: "fleet", fleetId, assetId: null })
      .where(eq(maintenanceSchedules.id, scheduleId)).run();
    // Preserve continuity: assign back to the originating asset + any new ones.
    const assetIds = Array.from(new Set([
      ...(originatingAsset ? [originatingAsset] : []),
      ...additionalAssetIds,
    ]));
    this.setScheduleAssignments(scheduleId, assetIds);
    return this.getSchedule(scheduleId)!;
  }

  // -- service events ----
  listServiceEvents(assetId?: number): ServiceEvent[] {
    const q = db.select().from(serviceEvents).orderBy(desc(serviceEvents.performedAt));
    return assetId ? q.where(eq(serviceEvents.assetId, assetId)).all() : q.all();
  }
  getServiceEvent(id: number): ServiceEvent | undefined {
    return db.select().from(serviceEvents).where(eq(serviceEvents.id, id)).get();
  }
  createServiceEvent(input: InsertServiceEvent): ServiceEvent {
    const event = db.insert(serviceEvents).values(input).returning().get();
    // Auto-create a meter reading when the service captured one.
    if (input.meterAtService != null) {
      this.createMeterReading({
        assetId: input.assetId,
        readingType: this.getAsset(input.assetId)?.meterType ?? "mileage",
        value: input.meterAtService,
        readingDate: input.performedAt,
        notes: `Recorded with service: ${input.title}`,
        source: "service-event",
      } as InsertMeterReading);
    }
    return event;
  }
  updateServiceEvent(id: number, input: Partial<InsertServiceEvent>): ServiceEvent | undefined {
    return db.update(serviceEvents).set(input).where(eq(serviceEvents.id, id)).returning().get();
  }
  deleteServiceEvent(id: number): boolean {
    // Restore any consumed inventory (mirroring replaceLineItems behavior) and remove line items + movements.
    const existing = this.listLineItems(id);
    for (const line of existing) {
      if (line.inventoryItemId) {
        db.update(inventoryItems)
          .set({ onHand: sql`${inventoryItems.onHand} + ${line.quantity}` })
          .where(eq(inventoryItems.id, line.inventoryItemId)).run();
      }
    }
    db.delete(inventoryMovements).where(eq(inventoryMovements.serviceEventId, id)).run();
    db.delete(serviceLineItems).where(eq(serviceLineItems.serviceEventId, id)).run();
    return db.delete(serviceEvents).where(eq(serviceEvents.id, id)).run().changes > 0;
  }
  listLineItems(serviceEventId?: number): ServiceLineItem[] {
    const q = db.select().from(serviceLineItems);
    return serviceEventId ? q.where(eq(serviceLineItems.serviceEventId, serviceEventId)).all() : q.all();
  }
  createLineItem(input: InsertServiceLineItem): ServiceLineItem {
    const line = db.insert(serviceLineItems).values(input).returning().get();
    if (input.inventoryItemId) {
      // Decrement stock and record movement.
      db.update(inventoryItems)
        .set({ onHand: sql`${inventoryItems.onHand} - ${input.quantity}` })
        .where(eq(inventoryItems.id, input.inventoryItemId)).run();
      const event = this.getServiceEvent(input.serviceEventId);
      db.insert(inventoryMovements).values({
        inventoryItemId: input.inventoryItemId,
        movementType: "consumption",
        quantity: -input.quantity,
        serviceEventId: input.serviceEventId,
        occurredAt: event?.performedAt ?? new Date(),
        notes: `Consumed by service event #${input.serviceEventId}`,
      }).run();
    }
    return line;
  }
  replaceLineItems(serviceEventId: number, input: InsertServiceLineItem[]): ServiceLineItem[] {
    const existing = this.listLineItems(serviceEventId);
    for (const line of existing) {
      if (line.inventoryItemId) {
        db.update(inventoryItems)
          .set({ onHand: sql`${inventoryItems.onHand} + ${line.quantity}` })
          .where(eq(inventoryItems.id, line.inventoryItemId)).run();
      }
    }
    db.delete(inventoryMovements)
      .where(and(eq(inventoryMovements.serviceEventId, serviceEventId), eq(inventoryMovements.movementType, "consumption")))
      .run();
    db.delete(serviceLineItems).where(eq(serviceLineItems.serviceEventId, serviceEventId)).run();
    return input.map(line => this.createLineItem({ ...line, serviceEventId }));
  }

  // -- inventory ----
  listInventoryItems(fleetId?: number): InventoryItem[] {
    const q = db.select().from(inventoryItems).orderBy(inventoryItems.name);
    return fleetId ? q.where(eq(inventoryItems.fleetId, fleetId)).all() : q.all();
  }
  getInventoryItem(id: number): InventoryItem | undefined {
    return db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).get();
  }
  createInventoryItem(input: InsertInventoryItem): InventoryItem {
    return db.insert(inventoryItems).values(input).returning().get();
  }
  updateInventoryItem(id: number, input: Partial<InsertInventoryItem>): InventoryItem | undefined {
    return db.update(inventoryItems).set(input).where(eq(inventoryItems.id, id)).returning().get();
  }
  deleteInventoryItem(id: number): boolean {
    return db.delete(inventoryItems).where(eq(inventoryItems.id, id)).run().changes > 0;
  }
  listInventoryMovements(itemId?: number): InventoryMovement[] {
    const q = db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.occurredAt));
    return itemId ? q.where(eq(inventoryMovements.inventoryItemId, itemId)).all() : q.all();
  }
  createInventoryMovement(input: InsertInventoryMovement): InventoryMovement {
    const movement = db.insert(inventoryMovements).values(input).returning().get();
    db.update(inventoryItems)
      .set({ onHand: sql`${inventoryItems.onHand} + ${input.quantity}` })
      .where(eq(inventoryItems.id, input.inventoryItemId)).run();
    return movement;
  }

  // -- attachments ----
  listAttachments(entityType?: string, entityId?: number): Attachment[] {
    const rows = db.select().from(attachments).orderBy(desc(attachments.createdAt)).all();
    return rows.filter(a =>
      (!entityType || a.entityType === entityType) &&
      (!entityId || a.entityId === entityId)
    );
  }
  createAttachment(input: InsertAttachment): Attachment {
    return db.insert(attachments).values(input).returning().get();
  }

  // -- settings ----
  listAppSettings(): AppSetting[] {
    return db.select().from(appSettings).all();
  }
  upsertAppSetting(input: InsertAppSetting): AppSetting {
    const existing = db.select().from(appSettings).where(eq(appSettings.key, input.key)).get();
    if (existing) {
      return db.update(appSettings).set({ value: input.value, updatedAt: input.updatedAt })
        .where(eq(appSettings.key, input.key)).returning().get();
    }
    return db.insert(appSettings).values(input).returning().get();
  }
}

export const storage = new DatabaseStorage();

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export function seedIfEmpty() {
  const existingFleets = storage.listFleets();
  if (existingFleets.length > 0) return;

  const fleet = storage.createFleet({
    name: "Sessanna Home Fleet",
    slug: "home",
    currency: "USD",
    notes: "Personal vehicles, trailers, generators, lawn and snow equipment.",
  });

  const homeSite = storage.createSite({ fleetId: fleet.id, name: "Home Garage", address: "Upstate NY" });

  // Users + memberships (local auth simulation; AD coming later)
  const owner = storage.createUser({
    username: "jaimy",
    displayName: "Jaimy Sessanna",
    email: "jaimy@sessanna.com",
    passwordHash: null,
    systemAdmin: true,
  });
  const tech = storage.createUser({
    username: "tech",
    displayName: "Workshop Tech",
    email: null,
    passwordHash: null,
    systemAdmin: false,
  });
  const viewer = storage.createUser({
    username: "viewer",
    displayName: "Read-only Viewer",
    email: null,
    passwordHash: null,
    systemAdmin: false,
  });
  storage.upsertFleetMembership({ fleetId: fleet.id, userId: owner.id, role: "admin" });
  storage.upsertFleetMembership({ fleetId: fleet.id, userId: tech.id, role: "editor" });
  storage.upsertFleetMembership({ fleetId: fleet.id, userId: viewer.id, role: "viewer" });
  for (const type of DEFAULT_EQUIPMENT_TYPE_ROWS) {
    storage.createFleetEquipmentType({ fleetId: fleet.id, active: true, ...type });
  }
  const oilCategory = storage.createInventoryCategory({ fleetId: fleet.id, name: "oil", description: "Engine oil, hydraulic oil, and other lubricants.", active: true });
  storage.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Viscosity", fieldType: "text", required: false, sortOrder: 1 });
  storage.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Container Size", fieldType: "text", required: false, sortOrder: 2 });
  const filterCategory = storage.createInventoryCategory({ fleetId: fleet.id, name: "filter", description: "Oil, air, fuel, cabin, and hydraulic filters.", active: true });
  storage.createInventoryCategoryField({ categoryId: filterCategory.id, name: "Filter Type", fieldType: "text", required: false, sortOrder: 1 });
  storage.createInventoryCategory({ fleetId: fleet.id, name: "fluid", description: "ATF, coolant, brake fluid, gear oil, and additives.", active: true });
  storage.createInventoryCategory({ fleetId: fleet.id, name: "part", description: "General replacement parts and ad-hoc items.", active: true });

  // ----- Assets ------------------------------------------------------------
  const today = new Date();
  const meterDate = new Date("2025-08-27");

  const silverado = storage.createAsset({
    fleetId: fleet.id,
    siteId: homeSite.id,
    friendlyName: "2005 Silverado 2500HD",
    assetType: "vehicle",
    year: 2005,
    make: "Chevrolet",
    model: "Silverado 2500HD",
    trim: "LT",
    vin: "1GCHK29U65E102198",
    serial: null,
    engine: "6.0 LQ4 V8",
    transmission: "4L80E",
    drivetrain: "4WD",
    meterType: "mileage",
    meterLabel: null,
    currentMeter: 78510,
    meterAsOf: meterDate,
    status: "active",
    notes: null,
  });

  const tahoe = storage.createAsset({
    fleetId: fleet.id,
    siteId: homeSite.id,
    friendlyName: "2005 Tahoe LT Z71",
    assetType: "vehicle",
    year: 2005,
    make: "Chevrolet",
    model: "Tahoe",
    trim: "LT Z71",
    vin: "1GNEK13T05R204731",
    serial: null,
    engine: "5.3 LM7 V8",
    transmission: "4L60E",
    drivetrain: "4WD",
    meterType: "mileage",
    currentMeter: 330171,
    meterAsOf: meterDate,
    status: "active",
    notes: "Daily driver. Imported from legacy Tahoe spreadsheet.",
  });

  const generator = storage.createAsset({
    fleetId: fleet.id,
    siteId: homeSite.id,
    friendlyName: "Generac 22kW Standby",
    assetType: "generator",
    year: 2019,
    make: "Generac",
    model: "Guardian 22kW",
    meterType: "hours",
    currentMeter: 184.5,
    meterAsOf: today,
    status: "active",
  });

  const trailer = storage.createAsset({
    fleetId: fleet.id,
    siteId: homeSite.id,
    friendlyName: "Sure-Trac 7x14 Dump",
    assetType: "trailer",
    year: 2021,
    make: "Sure-Trac",
    model: "7x14 Dump",
    meterType: "count",
    meterLabel: "Loads",
    currentMeter: 47,
    meterAsOf: today,
    status: "active",
    notes: "Tandem axle. Annual NY inspection due each spring.",
  });

  // ----- Schedules ---------------------------------------------------------
  // Silverado
  const oilSchedSilverado = storage.createSchedule({
    assetId: silverado.id,
    name: "Oil Change",
    category: "engine",
    readingType: "mileage",
    meterInterval: 3000,
    dayInterval: 365,
    meterDueSoon: 250,
    dayDueSoon: 30,
    notes: "Routine engine oil and filter service.",
    active: true,
  });
  storage.createSchedule({
    assetId: silverado.id, name: "Air Filter", category: "engine",
    readingType: "mileage", meterInterval: 20000, dayInterval: null,
    meterDueSoon: 1500, dayDueSoon: null, notes: "Engine air filter replacement.", active: true,
  });
  storage.createSchedule({
    assetId: silverado.id, name: "Transmission Service", category: "drivetrain",
    readingType: "mileage", meterInterval: 30000, dayInterval: null,
    meterDueSoon: 2000, dayDueSoon: null, notes: "ATF + filter.", active: true,
  });
  storage.createSchedule({
    assetId: silverado.id, name: "Coolant Service", category: "engine",
    readingType: "mileage", meterInterval: 100000, dayInterval: 1825,
    meterDueSoon: 5000, dayDueSoon: 60, notes: "Flush and replace coolant on time-based intervals.", active: true,
  });
  storage.createSchedule({
    assetId: silverado.id, name: "Annual NY Inspection", category: "inspection",
    readingType: "mileage", meterInterval: null, dayInterval: 365,
    meterDueSoon: null, dayDueSoon: 30, notes: "Time-only schedule. Triggered by day interval.", active: true,
  });
  storage.createSchedule({
    assetId: silverado.id, name: "Battery Terminal Service", category: "other",
    readingType: "mileage", meterInterval: null, dayInterval: 180,
    meterDueSoon: null, dayDueSoon: 21, notes: "Clean and protect battery terminals every 6 months.", active: true,
  });

  // Tahoe — minimal seeded schedules
  storage.createSchedule({
    assetId: tahoe.id, name: "Oil Change", category: "engine",
    readingType: "mileage", meterInterval: 5000, dayInterval: 365,
    meterDueSoon: 300, dayDueSoon: 30, notes: "5W-30 conventional, AC Delco PF48.", active: true,
  });

  // Generator
  storage.createSchedule({
    assetId: generator.id, name: "Oil & Filter (Hours)", category: "engine",
    readingType: "hours", meterInterval: 200, dayInterval: 730,
    meterDueSoon: 25, dayDueSoon: 60, notes: "Synthetic 5W-30, replace OEM filter.", active: true,
  });

  // Trailer
  storage.createSchedule({
    assetId: trailer.id, name: "Annual NY Inspection", category: "inspection",
    readingType: "count", meterInterval: null, dayInterval: 365,
    meterDueSoon: null, dayDueSoon: 30, notes: "Time-only.", active: true,
  });
  storage.createSchedule({
    assetId: trailer.id, name: "Bearing Re-pack", category: "drivetrain",
    readingType: "count", meterInterval: null, dayInterval: 730,
    meterDueSoon: null, dayDueSoon: 30, notes: "Every 2 years.", active: true,
  });

  // ----- Inventory ---------------------------------------------------------
  const oil5w30 = storage.createInventoryItem({
    fleetId: fleet.id, name: "Mobil 1 5W-30 Synthetic", category: "oil",
    sku: "M1-5W30-1Q", partNumber: "M1-5W30",
    unit: "qt", onHand: 12, reorderPoint: 6, reorderQuantity: 12,
    lowStockAlert: true, lowStockQuantity: 6, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 8.49, notes: "Engine oil, 1qt bottles.",
  });
  storage.createInventoryItem({
    fleetId: fleet.id, name: "AC Delco PF48 Oil Filter", category: "filter",
    sku: "ACD-PF48", partNumber: "PF48",
    unit: "each", onHand: 4, reorderPoint: 3, reorderQuantity: 6,
    lowStockAlert: true, lowStockQuantity: 3, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 9.99,
  });
  storage.createInventoryItem({
    fleetId: fleet.id, name: "K&N Air Filter 33-2129", category: "filter",
    partNumber: "33-2129", unit: "each", onHand: 1, reorderPoint: 1,
    reorderQuantity: 1, stocked: true, unitCost: 64.99,
    lowStockAlert: true, lowStockQuantity: 1, reorderReminder: true, costTracking: true,
  });
  storage.createInventoryItem({
    fleetId: fleet.id, name: "Dexron VI ATF", category: "fluid",
    unit: "qt", onHand: 5, reorderPoint: 4, reorderQuantity: 12,
    lowStockAlert: true, lowStockQuantity: 4, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 7.49,
  });
  storage.createInventoryItem({
    fleetId: fleet.id, name: "Bosch ICON 22\" Wiper", category: "wiper",
    unit: "each", onHand: 0, reorderPoint: 1, reorderQuantity: 2,
    lowStockAlert: true, lowStockQuantity: 1, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 28.99, notes: "Driver side.",
  });
  storage.createInventoryItem({
    fleetId: fleet.id, name: "DeWalt 12\" Bar Oil 1qt", category: "fluid",
    unit: "qt", onHand: 2, reorderPoint: null, reorderQuantity: null,
    lowStockAlert: false, lowStockQuantity: null, reorderReminder: false,
    costTracking: false, stocked: false, notes: "Ad-hoc, not on routine reorder.",
  });

  // ----- Past service event -- gives Silverado oil-change history ---------
  const sEvent = storage.createServiceEvent({
    assetId: silverado.id,
    scheduleId: oilSchedSilverado.id,
    eventType: "scheduled",
    title: "Oil Change",
    performedAt: meterDate,
    meterAtService: 78510,
    vendor: "Self",
    technician: "Jaimy",
    cost: 42.45,
    notes: "Mobil 1 5W-30, PF48 filter.",
  });
  storage.createLineItem({
    serviceEventId: sEvent.id,
    inventoryItemId: oil5w30.id,
    itemName: "Mobil 1 5W-30 Synthetic",
    partNumber: "M1-5W30",
    brand: "Mobil 1",
    spec: "5W-30",
    quantity: 6,
    unit: "qt",
    unitCost: 8.49,
    notes: null,
  });
}

seedIfEmpty();
ensureEveryFleetHasAdmin();

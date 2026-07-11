import {
  fleets,
  sites,
  users,
  fleetMemberships,
  fleetEquipmentTypes,
  fleetFuelTypes,
  fleetRoles,
  fleetRolePermissions,
  inventoryCategories,
  inventoryCategoryFields,
  assets,
  meterReadings,
  maintenanceSchedules,
  maintenanceScheduleAssignments,
  serviceFacilities,
  serviceFacilityAddresses,
  serviceFacilityTypes,
  serviceEvents,
  serviceLineItems,
  inventoryItems,
  inventoryMovements,
  attachments,
  appSettings,
  oidcGroupMappings,
  systemSettings,
  auditLog,
  lookupProviders,
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
  ServiceFacility, InsertServiceFacility,
  ServiceFacilityAddress, InsertServiceFacilityAddress,
  ServiceFacilityType, InsertServiceFacilityType,
  ServiceEvent, InsertServiceEvent,
  ServiceLineItem, InsertServiceLineItem,
  InventoryItem, InsertInventoryItem,
  InventoryMovement, InsertInventoryMovement,
  Attachment, InsertAttachment,
  AppSetting, InsertAppSetting,
  OidcGroupMapping, InsertOidcGroupMapping,
  SystemSettings, InsertSystemSettings,
  AuditLog,
  LookupProvider, InsertLookupProvider,
} from "@shared/schema";
import type { PermissionKey } from "@shared/permissions";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import path from "node:path";
import { recordAudit, diffChanges, redactSnapshot } from "./audit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool);

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
  { name: "viewer", description: "Can view dashboards, assets, service history, meters, inventory, and reports. Cannot edit.", builtIn: true },
  { name: "editor", description: "Can add and update assets, meters, services, schedules, and inventory.", builtIn: true },
  { name: "admin", description: "Can manage fleet settings, users, memberships, and all editor workflows.", builtIn: true },
];

const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  viewer: ["assets.view", "inventory.view", "data.export"],
  editor: [
    "assets.view", "inventory.view", "data.export",
    "assets.edit", "assets.delete", "meters.log", "meters.edit",
    "schedules.manage", "service.log", "service.edit", "inventory.manage",
  ],
  admin: [
    "assets.view", "inventory.view", "data.export",
    "assets.edit", "assets.delete", "meters.log", "meters.edit",
    "schedules.manage", "service.log", "service.edit", "inventory.manage",
    "fleets.manage_settings", "users.manage", "roles.manage", "system.admin",
  ],
};

async function roleHasPermission(roleId: number, key: PermissionKey): Promise<boolean> {
  const [row] = await db.select().from(fleetRolePermissions)
    .where(and(eq(fleetRolePermissions.roleId, roleId), eq(fleetRolePermissions.permissionKey, key)));
  return !!row;
}

// A role is admin-equivalent for the last-fleet-admin safety net iff it can
// manage roles/access — that's the one thing a fleet can never be left without.
async function isAdminRoleId(roleId: number): Promise<boolean> {
  return roleHasPermission(roleId, "roles.manage");
}

// Effective system-admin status: either the hardcoded users.system_admin
// bootstrap flag, or the grantable "system.admin" permission on any of the
// user's fleet roles. server/auth.ts folds this into req.user.systemAdmin on
// every request so every existing systemAdmin check picks it up for free.
export async function userHasSystemAdminPermission(userId: number): Promise<boolean> {
  const memberships = await db.select().from(fleetMemberships).where(eq(fleetMemberships.userId, userId));
  for (const m of memberships) {
    if (await roleHasPermission(m.roleId, "system.admin")) return true;
  }
  return false;
}

async function adminRoleIdForFleet(fleetId: number): Promise<number | undefined> {
  const roles = await db.select().from(fleetRoles).where(eq(fleetRoles.fleetId, fleetId));
  for (const role of roles) {
    if (await isAdminRoleId(role.id)) return role.id;
  }
  return undefined;
}

async function countFleetAdmins(fleetId: number, excludeMembershipId?: number, excludeUserId?: number): Promise<number> {
  const memberships = await db.select().from(fleetMemberships).where(eq(fleetMemberships.fleetId, fleetId));
  const candidates = memberships.filter(m => m.id !== excludeMembershipId && m.userId !== excludeUserId);
  let count = 0;
  for (const m of candidates) {
    if (await isAdminRoleId(m.roleId)) count++;
  }
  return count;
}

async function assertFleetKeepsAdmin(fleetId: number, excludeMembershipId?: number, excludeUserId?: number) {
  if ((await countFleetAdmins(fleetId, excludeMembershipId, excludeUserId)) === 0) {
    throw new Error("cannot_remove_last_fleet_admin");
  }
}

async function ensureEveryFleetHasAdmin() {
  for (const fleet of await db.select().from(fleets)) {
    if ((await countFleetAdmins(fleet.id)) > 0) continue;
    const adminRoleId = await adminRoleIdForFleet(fleet.id);
    if (adminRoleId == null) continue; // fleet has no admin-equivalent role configured
    const [firstMembership] = await db.select().from(fleetMemberships)
      .where(eq(fleetMemberships.fleetId, fleet.id))
      .orderBy(fleetMemberships.id);
    if (firstMembership) {
      await db.update(fleetMemberships).set({ roleId: adminRoleId })
        .where(eq(fleetMemberships.id, firstMembership.id));
      continue;
    }
    const [existingUser] = await db.select().from(users).orderBy(users.id);
    let firstUser = existingUser;
    if (!firstUser) {
      const [created] = await db.insert(users).values({
        username: "fleet-admin",
        displayName: "Fleet Admin",
        email: null,
        passwordHash: null,
        systemAdmin: true,
      }).returning();
      firstUser = created;
    }
    await db.insert(fleetMemberships).values({ fleetId: fleet.id, userId: firstUser.id, roleId: adminRoleId });
  }
}

export interface AuditLogFilters {
  fleetId?: number;
  entityType?: string;
  actorUserId?: number;
  action?: "create" | "update" | "delete";
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface IStorage {
  // fleets / sites
  listFleets(): Promise<Fleet[]>;
  getFleet(id: number): Promise<Fleet | undefined>;
  updateFleet(id: number, input: Partial<InsertFleet>): Promise<Fleet | undefined>;
  createFleet(input: InsertFleet): Promise<Fleet>;
  deleteFleet(id: number): Promise<boolean>;

  listSites(fleetId: number): Promise<Site[]>;
  getSite(id: number): Promise<Site | undefined>;
  createSite(input: InsertSite): Promise<Site>;

  // users / memberships
  listUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(input: InsertUser): Promise<User>;
  updateUser(id: number, input: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<boolean>;
  listFleetMemberships(): Promise<FleetMembership[]>;
  upsertFleetMembership(input: InsertFleetMembership): Promise<FleetMembership>;
  deleteFleetMembership(fleetId: number, userId: number): Promise<boolean>;
  listFleetEquipmentTypes(fleetId?: number): Promise<FleetEquipmentType[]>;
  getFleetEquipmentType(id: number): Promise<FleetEquipmentType | undefined>;
  createFleetEquipmentType(input: InsertFleetEquipmentType): Promise<FleetEquipmentType>;
  updateFleetEquipmentType(id: number, input: Partial<InsertFleetEquipmentType>): Promise<FleetEquipmentType | undefined>;
  deleteFleetEquipmentType(id: number): Promise<boolean>;
  listFleetFuelTypes(fleetId?: number): Promise<FleetFuelType[]>;
  getFleetFuelType(id: number): Promise<FleetFuelType | undefined>;
  createFleetFuelType(input: InsertFleetFuelType): Promise<FleetFuelType>;
  updateFleetFuelType(id: number, input: Partial<InsertFleetFuelType>): Promise<FleetFuelType | undefined>;
  deleteFleetFuelType(id: number): Promise<boolean>;
  listServiceFacilities(): Promise<ServiceFacility[]>;
  getServiceFacility(id: number): Promise<ServiceFacility | undefined>;
  createServiceFacility(input: InsertServiceFacility): Promise<ServiceFacility>;
  updateServiceFacility(id: number, input: Partial<InsertServiceFacility>): Promise<ServiceFacility | undefined>;
  deleteServiceFacility(id: number): Promise<boolean>;
  listServiceFacilityAddresses(facilityId?: number): Promise<ServiceFacilityAddress[]>;
  getServiceFacilityAddress(id: number): Promise<ServiceFacilityAddress | undefined>;
  createServiceFacilityAddress(input: InsertServiceFacilityAddress): Promise<ServiceFacilityAddress>;
  updateServiceFacilityAddress(id: number, input: Partial<InsertServiceFacilityAddress>): Promise<ServiceFacilityAddress | undefined>;
  deleteServiceFacilityAddress(id: number): Promise<boolean>;
  listServiceFacilityTypes(): Promise<ServiceFacilityType[]>;
  getServiceFacilityType(id: number): Promise<ServiceFacilityType | undefined>;
  createServiceFacilityType(input: InsertServiceFacilityType): Promise<ServiceFacilityType>;
  updateServiceFacilityType(id: number, input: Partial<InsertServiceFacilityType>): Promise<ServiceFacilityType | undefined>;
  deleteServiceFacilityType(id: number): Promise<boolean>;
  listFleetRoles(fleetId?: number): Promise<FleetRole[]>;
  getFleetRole(id: number): Promise<FleetRole | undefined>;
  listFleetRolesWithPermissions(fleetId?: number): Promise<(FleetRole & { permissions: string[] })[]>;
  createFleetRole(input: InsertFleetRole): Promise<FleetRole>;
  updateFleetRole(id: number, input: Partial<InsertFleetRole>): Promise<FleetRole | undefined>;
  deleteFleetRole(id: number): Promise<boolean>;
  setFleetRolePermissions(roleId: number, keys: string[]): Promise<void>;
  listInventoryCategories(fleetId?: number): Promise<InventoryCategory[]>;
  getInventoryCategory(id: number): Promise<InventoryCategory | undefined>;
  createInventoryCategory(input: InsertInventoryCategory): Promise<InventoryCategory>;
  updateInventoryCategory(id: number, input: Partial<InsertInventoryCategory>): Promise<InventoryCategory | undefined>;
  deleteInventoryCategory(id: number): Promise<boolean>;
  listInventoryCategoryFields(categoryId?: number, fleetId?: number): Promise<InventoryCategoryField[]>;
  getInventoryCategoryField(id: number): Promise<InventoryCategoryField | undefined>;
  createInventoryCategoryField(input: InsertInventoryCategoryField): Promise<InventoryCategoryField>;
  updateInventoryCategoryField(id: number, input: Partial<InsertInventoryCategoryField>): Promise<InventoryCategoryField | undefined>;
  deleteInventoryCategoryField(id: number): Promise<boolean>;

  // assets
  listAssets(fleetId?: number): Promise<Asset[]>;
  getAsset(id: number): Promise<Asset | undefined>;
  createAsset(input: InsertAsset): Promise<Asset>;
  updateAsset(id: number, input: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: number): Promise<boolean>;

  // meter readings
  listMeterReadings(assetId?: number, fleetId?: number): Promise<MeterReading[]>;
  getMeterReading(id: number): Promise<MeterReading | undefined>;
  createMeterReading(input: InsertMeterReading): Promise<MeterReading>;
  updateMeterReading(id: number, input: Partial<InsertMeterReading>): Promise<MeterReading | undefined>;
  deleteMeterReading(id: number): Promise<boolean>;

  // schedules
  listSchedules(assetId?: number): Promise<MaintenanceSchedule[]>;
  listAllSchedulesForFleet(fleetId: number): Promise<MaintenanceSchedule[]>;
  listSchedulesAssignedToAsset(assetId: number): Promise<MaintenanceSchedule[]>;
  getSchedule(id: number): Promise<MaintenanceSchedule | undefined>;
  createSchedule(input: InsertMaintenanceSchedule): Promise<MaintenanceSchedule>;
  updateSchedule(id: number, input: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule | undefined>;
  deleteSchedule(id: number): Promise<boolean>;
  listScheduleAssignments(scheduleId?: number, fleetId?: number): Promise<MaintenanceScheduleAssignment[]>;
  setScheduleAssignments(scheduleId: number, assetIds: number[]): Promise<MaintenanceScheduleAssignment[]>;
  promoteScheduleToFleet(scheduleId: number, additionalAssetIds: number[]): Promise<MaintenanceSchedule>;

  // service events
  listServiceEvents(assetId?: number, fleetId?: number): Promise<ServiceEvent[]>;
  getServiceEvent(id: number): Promise<ServiceEvent | undefined>;
  createServiceEvent(input: InsertServiceEvent): Promise<ServiceEvent>;
  updateServiceEvent(id: number, input: Partial<InsertServiceEvent>): Promise<ServiceEvent | undefined>;
  deleteServiceEvent(id: number): Promise<boolean>;
  listLineItems(serviceEventId?: number, assetId?: number): Promise<ServiceLineItem[]>;
  getLineItem(id: number): Promise<ServiceLineItem | undefined>;
  createLineItem(input: InsertServiceLineItem): Promise<ServiceLineItem>;
  replaceLineItems(serviceEventId: number, input: InsertServiceLineItem[]): Promise<ServiceLineItem[]>;

  // inventory
  listInventoryItems(fleetId?: number): Promise<InventoryItem[]>;
  getInventoryItem(id: number): Promise<InventoryItem | undefined>;
  createInventoryItem(input: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: number, input: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: number): Promise<boolean>;
  listInventoryMovements(itemId?: number): Promise<InventoryMovement[]>;
  getInventoryMovement(id: number): Promise<InventoryMovement | undefined>;
  createInventoryMovement(input: InsertInventoryMovement): Promise<InventoryMovement>;

  // attachments
  listAttachments(entityType?: string, entityId?: number): Promise<Attachment[]>;
  createAttachment(input: InsertAttachment): Promise<Attachment>;

  // settings
  listAppSettings(): Promise<AppSetting[]>;
  upsertAppSetting(input: InsertAppSetting): Promise<AppSetting>;

  // auth: system settings (auth-mode + OIDC config, singleton row)
  getSystemSettings(): Promise<SystemSettings>;
  updateSystemSettings(patch: Partial<InsertSystemSettings>): Promise<SystemSettings>;

  // auth: OIDC group -> fleet/role mappings
  listOidcGroupMappings(): Promise<OidcGroupMapping[]>;
  getOidcGroupMapping(id: number): Promise<OidcGroupMapping | undefined>;
  createOidcGroupMapping(input: InsertOidcGroupMapping): Promise<OidcGroupMapping>;
  updateOidcGroupMapping(id: number, input: Partial<InsertOidcGroupMapping>): Promise<OidcGroupMapping | undefined>;
  deleteOidcGroupMapping(id: number): Promise<boolean>;

  // audit log
  listAuditLog(filters: AuditLogFilters): Promise<{ rows: AuditLog[]; total: number }>;

  // lookup providers (Privacy & Lookups)
  listLookupProviders(category?: string): Promise<LookupProvider[]>;
  getLookupProvider(id: number): Promise<LookupProvider | undefined>;
  createLookupProvider(input: InsertLookupProvider): Promise<LookupProvider>;
  updateLookupProvider(id: number, input: Partial<InsertLookupProvider>): Promise<LookupProvider | undefined>;
  deleteLookupProvider(id: number): Promise<boolean>;
}

export class DatabaseStorage implements IStorage {
  // -- fleets ----
  async listFleets(): Promise<Fleet[]> {
    return db.select().from(fleets).orderBy(asc(fleets.id));
  }
  async getFleet(id: number): Promise<Fleet | undefined> {
    const [row] = await db.select().from(fleets).where(eq(fleets.id, id));
    return row;
  }
  async updateFleet(id: number, input: Partial<InsertFleet>): Promise<Fleet | undefined> {
    const before = await this.getFleet(id);
    const [row] = await db.update(fleets).set(input).where(eq(fleets.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "fleet", entityId: row.id, entityLabel: row.name, fleetId: null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async createFleet(input: InsertFleet): Promise<Fleet> {
    const [fleet] = await db.insert(fleets).values(input).returning();
    await recordAudit({ action: "create", entityType: "fleet", entityId: fleet.id, entityLabel: fleet.name, fleetId: null, changes: redactSnapshot(fleet) });
    await this.seedDefaultFleetRoles(fleet.id);
    for (const fuel of DEFAULT_FUEL_TYPE_ROWS) {
      await db.insert(fleetFuelTypes).values({ fleetId: fleet.id, ...fuel });
    }
    for (const type of DEFAULT_EQUIPMENT_TYPE_ROWS) {
      await db.insert(fleetEquipmentTypes).values({ fleetId: fleet.id, active: true, ...type });
    }
    const oilCategory = await this.createInventoryCategory({ fleetId: fleet.id, name: "oil", description: "Engine oil, hydraulic oil, and other lubricants.", active: true, sortOrder: 0, color: "#2563eb", icon: "droplet" });
    await this.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Viscosity", fieldType: "text", required: false, sortOrder: 1, highlightField: true });
    await this.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Container Size", fieldType: "text", required: false, sortOrder: 2, highlightField: false });
    const filterCategory = await this.createInventoryCategory({ fleetId: fleet.id, name: "filter", description: "Oil, air, fuel, cabin, and hydraulic filters.", active: true, sortOrder: 1, color: "#0d9488", icon: "filter" });
    await this.createInventoryCategoryField({ categoryId: filterCategory.id, name: "Filter Type", fieldType: "text", required: false, sortOrder: 1, highlightField: true });
    await this.createInventoryCategory({ fleetId: fleet.id, name: "fluid", description: "ATF, coolant, brake fluid, gear oil, and additives.", active: true, sortOrder: 2, color: "#0891b2", icon: "waves" });
    await this.createInventoryCategory({ fleetId: fleet.id, name: "part", description: "General replacement parts and ad-hoc items.", active: true, sortOrder: 3, color: "#7c3aed", icon: "wrench" });
    return fleet;
  }

  // Deleting a fleet cascades through every fleet-scoped table by hand since
  // none of the FKs are declared ON DELETE CASCADE. Children are removed
  // before their parents; attachments are cleaned up too even though they
  // have no DB-level FK (polymorphic entityType/entityId).
  async deleteFleet(id: number): Promise<boolean> {
    const existingFleet = await this.getFleet(id);
    const fleetAssets = await db.select({ id: assets.id }).from(assets).where(eq(assets.fleetId, id));
    const assetIds = fleetAssets.map(a => a.id);

    const fleetServiceEvents = assetIds.length
      ? await db.select({ id: serviceEvents.id }).from(serviceEvents).where(inArray(serviceEvents.assetId, assetIds))
      : [];
    const serviceEventIds = fleetServiceEvents.map(e => e.id);

    const fleetInventoryItems = await db.select({ id: inventoryItems.id }).from(inventoryItems).where(eq(inventoryItems.fleetId, id));
    const inventoryItemIds = fleetInventoryItems.map(i => i.id);

    const fleetInventoryCategories = await db.select({ id: inventoryCategories.id }).from(inventoryCategories).where(eq(inventoryCategories.fleetId, id));
    const categoryIds = fleetInventoryCategories.map(c => c.id);

    const fleetRoleRows = await db.select({ id: fleetRoles.id }).from(fleetRoles).where(eq(fleetRoles.fleetId, id));
    const roleIds = fleetRoleRows.map(r => r.id);

    if (serviceEventIds.length) {
      await db.delete(attachments).where(and(eq(attachments.entityType, "service-event"), inArray(attachments.entityId, serviceEventIds)));
    }
    if (inventoryItemIds.length) {
      await db.delete(attachments).where(and(eq(attachments.entityType, "inventory-item"), inArray(attachments.entityId, inventoryItemIds)));
      const movements = await db.select({ id: inventoryMovements.id }).from(inventoryMovements).where(inArray(inventoryMovements.inventoryItemId, inventoryItemIds));
      const movementIds = movements.map(m => m.id);
      if (movementIds.length) {
        await db.delete(attachments).where(and(eq(attachments.entityType, "inventory-movement"), inArray(attachments.entityId, movementIds)));
      }
      await db.delete(inventoryMovements).where(inArray(inventoryMovements.inventoryItemId, inventoryItemIds));
    }

    if (serviceEventIds.length) {
      await db.delete(serviceLineItems).where(inArray(serviceLineItems.serviceEventId, serviceEventIds));
    }
    if (assetIds.length) {
      await db.delete(meterReadings).where(inArray(meterReadings.assetId, assetIds));
    }

    // Schedules: fleet-scoped (fleetId = this fleet) and asset-scoped (assetId in this fleet's assets).
    const fleetScopedSchedules = await db.select({ id: maintenanceSchedules.id }).from(maintenanceSchedules).where(eq(maintenanceSchedules.fleetId, id));
    const assetScopedSchedules = assetIds.length
      ? await db.select({ id: maintenanceSchedules.id }).from(maintenanceSchedules).where(inArray(maintenanceSchedules.assetId, assetIds))
      : [];
    const scheduleIds = Array.from(new Set([...fleetScopedSchedules, ...assetScopedSchedules].map(s => s.id)));
    if (scheduleIds.length) {
      await db.delete(maintenanceScheduleAssignments).where(inArray(maintenanceScheduleAssignments.scheduleId, scheduleIds));
      await db.delete(maintenanceSchedules).where(inArray(maintenanceSchedules.id, scheduleIds));
    }

    if (serviceEventIds.length) {
      await db.delete(serviceEvents).where(inArray(serviceEvents.id, serviceEventIds));
    }
    if (assetIds.length) {
      await db.delete(assets).where(inArray(assets.id, assetIds));
    }
    if (inventoryItemIds.length) {
      await db.delete(inventoryItems).where(inArray(inventoryItems.id, inventoryItemIds));
    }
    if (categoryIds.length) {
      await db.delete(inventoryCategoryFields).where(inArray(inventoryCategoryFields.categoryId, categoryIds));
      await db.delete(inventoryCategories).where(inArray(inventoryCategories.id, categoryIds));
    }
    await db.delete(fleetEquipmentTypes).where(eq(fleetEquipmentTypes.fleetId, id));
    await db.delete(fleetFuelTypes).where(eq(fleetFuelTypes.fleetId, id));
    await db.delete(oidcGroupMappings).where(eq(oidcGroupMappings.fleetId, id));
    await db.delete(fleetMemberships).where(eq(fleetMemberships.fleetId, id));
    if (roleIds.length) {
      await db.delete(fleetRolePermissions).where(inArray(fleetRolePermissions.roleId, roleIds));
      await db.delete(fleetRoles).where(inArray(fleetRoles.id, roleIds));
    }
    await db.delete(sites).where(eq(sites.fleetId, id));
    const result = await db.delete(fleets).where(eq(fleets.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existingFleet) {
      await recordAudit({ action: "delete", entityType: "fleet", entityId: id, entityLabel: existingFleet.name, fleetId: null, changes: redactSnapshot(existingFleet) });
    }
    return removed;
  }

  private async seedDefaultFleetRoles(fleetId: number): Promise<void> {
    for (const role of DEFAULT_FLEET_ROLE_ROWS) {
      const [createdRole] = await db.insert(fleetRoles).values({ fleetId, ...role }).returning();
      const keys = DEFAULT_ROLE_PERMISSIONS[role.name] ?? [];
      for (const key of keys) {
        await db.insert(fleetRolePermissions).values({ roleId: createdRole.id, permissionKey: key });
      }
    }
  }

  async listSites(fleetId: number): Promise<Site[]> {
    return db.select().from(sites).where(eq(sites.fleetId, fleetId));
  }
  async getSite(id: number): Promise<Site | undefined> {
    const [row] = await db.select().from(sites).where(eq(sites.id, id));
    return row;
  }
  async createSite(input: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(input).returning();
    await recordAudit({ action: "create", entityType: "site", entityId: site.id, entityLabel: site.name, fleetId: site.fleetId, changes: redactSnapshot(site) });
    return site;
  }

  // -- users / memberships ----
  async listUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.displayName);
  }
  async getUser(id: number): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.id, id));
    return row;
  }
  async getUserByUsername(username: string): Promise<User | undefined> {
    const [row] = await db.select().from(users).where(eq(users.username, username));
    return row;
  }
  async createUser(input: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(input).returning();
    await recordAudit({ action: "create", entityType: "user", entityId: user.id, entityLabel: user.username, fleetId: null, changes: redactSnapshot(user) });
    return user;
  }
  async updateUser(id: number, input: Partial<InsertUser>): Promise<User | undefined> {
    const before = await this.getUser(id);
    const [row] = await db.update(users).set(input).where(eq(users.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "user", entityId: row.id, entityLabel: row.username, fleetId: null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteUser(id: number): Promise<boolean> {
    const existing = await this.getUser(id);
    const memberships = await db.select().from(fleetMemberships).where(eq(fleetMemberships.userId, id));
    for (const membership of memberships) {
      if (await isAdminRoleId(membership.roleId)) {
        await assertFleetKeepsAdmin(membership.fleetId, undefined, id);
      }
    }
    await db.delete(fleetMemberships).where(eq(fleetMemberships.userId, id));
    const result = await db.delete(users).where(eq(users.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "user", entityId: id, entityLabel: existing.username, fleetId: null, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listFleetMemberships(): Promise<FleetMembership[]> {
    return db.select().from(fleetMemberships);
  }
  private async fleetMembershipLabel(userId: number, roleId: number): Promise<string> {
    const [user, role] = await Promise.all([this.getUser(userId), this.getFleetRole(roleId)]);
    return `${user?.username ?? `user #${userId}`} → ${role?.name ?? `role #${roleId}`}`;
  }
  async upsertFleetMembership(input: InsertFleetMembership): Promise<FleetMembership> {
    const [existing] = await db.select().from(fleetMemberships)
      .where(and(eq(fleetMemberships.fleetId, input.fleetId), eq(fleetMemberships.userId, input.userId)));
    if (existing) {
      if ((await isAdminRoleId(existing.roleId)) && !(await isAdminRoleId(input.roleId))) {
        await assertFleetKeepsAdmin(existing.fleetId, existing.id);
      }
      const [updated] = await db.update(fleetMemberships).set({ roleId: input.roleId, grantedBy: input.grantedBy ?? "manual" })
        .where(eq(fleetMemberships.id, existing.id)).returning();
      await recordAudit({ action: "update", entityType: "fleet_membership", entityId: updated.id, entityLabel: await this.fleetMembershipLabel(updated.userId, updated.roleId), fleetId: updated.fleetId, changes: diffChanges(existing, updated) });
      return updated;
    }
    const [created] = await db.insert(fleetMemberships).values(input).returning();
    await recordAudit({ action: "create", entityType: "fleet_membership", entityId: created.id, entityLabel: await this.fleetMembershipLabel(created.userId, created.roleId), fleetId: created.fleetId, changes: redactSnapshot(created) });
    return created;
  }
  async deleteFleetMembership(fleetId: number, userId: number): Promise<boolean> {
    const [existing] = await db.select().from(fleetMemberships)
      .where(and(eq(fleetMemberships.fleetId, fleetId), eq(fleetMemberships.userId, userId)));
    if (existing && (await isAdminRoleId(existing.roleId))) {
      await assertFleetKeepsAdmin(fleetId, existing.id);
    }
    const result = await db.delete(fleetMemberships)
      .where(and(eq(fleetMemberships.fleetId, fleetId), eq(fleetMemberships.userId, userId)));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "fleet_membership", entityId: existing.id, entityLabel: await this.fleetMembershipLabel(existing.userId, existing.roleId), fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listFleetEquipmentTypes(fleetId?: number): Promise<FleetEquipmentType[]> {
    const q = db.select().from(fleetEquipmentTypes).orderBy(fleetEquipmentTypes.name);
    return fleetId ? await q.where(eq(fleetEquipmentTypes.fleetId, fleetId)) : await q;
  }
  async getFleetEquipmentType(id: number): Promise<FleetEquipmentType | undefined> {
    const [row] = await db.select().from(fleetEquipmentTypes).where(eq(fleetEquipmentTypes.id, id));
    return row;
  }
  async createFleetEquipmentType(input: InsertFleetEquipmentType): Promise<FleetEquipmentType> {
    const [row] = await db.insert(fleetEquipmentTypes).values(input).returning();
    await recordAudit({ action: "create", entityType: "fleet_equipment_type", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateFleetEquipmentType(id: number, input: Partial<InsertFleetEquipmentType>): Promise<FleetEquipmentType | undefined> {
    const before = await this.getFleetEquipmentType(id);
    const [row] = await db.update(fleetEquipmentTypes).set(input).where(eq(fleetEquipmentTypes.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "fleet_equipment_type", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteFleetEquipmentType(id: number): Promise<boolean> {
    const existing = await this.getFleetEquipmentType(id);
    const result = await db.delete(fleetEquipmentTypes).where(eq(fleetEquipmentTypes.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "fleet_equipment_type", entityId: id, entityLabel: existing.name, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listFleetFuelTypes(fleetId?: number): Promise<FleetFuelType[]> {
    if (fleetId) {
      const existing = await db.select().from(fleetFuelTypes).where(eq(fleetFuelTypes.fleetId, fleetId));
      if (existing.length === 0) {
        for (const fuel of DEFAULT_FUEL_TYPE_ROWS) {
          await db.insert(fleetFuelTypes).values({ fleetId, ...fuel });
        }
      }
    }
    const q = db.select().from(fleetFuelTypes).orderBy(fleetFuelTypes.name);
    return fleetId ? await q.where(eq(fleetFuelTypes.fleetId, fleetId)) : await q;
  }
  async getFleetFuelType(id: number): Promise<FleetFuelType | undefined> {
    const [row] = await db.select().from(fleetFuelTypes).where(eq(fleetFuelTypes.id, id));
    return row;
  }
  async createFleetFuelType(input: InsertFleetFuelType): Promise<FleetFuelType> {
    const [row] = await db.insert(fleetFuelTypes).values(input).returning();
    await recordAudit({ action: "create", entityType: "fleet_fuel_type", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateFleetFuelType(id: number, input: Partial<InsertFleetFuelType>): Promise<FleetFuelType | undefined> {
    const before = await this.getFleetFuelType(id);
    const [row] = await db.update(fleetFuelTypes).set(input).where(eq(fleetFuelTypes.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "fleet_fuel_type", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteFleetFuelType(id: number): Promise<boolean> {
    const existing = await this.getFleetFuelType(id);
    const result = await db.delete(fleetFuelTypes).where(eq(fleetFuelTypes.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "fleet_fuel_type", entityId: id, entityLabel: existing.name, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listServiceFacilities(): Promise<ServiceFacility[]> {
    return await db.select().from(serviceFacilities).orderBy(serviceFacilities.name);
  }
  async getServiceFacility(id: number): Promise<ServiceFacility | undefined> {
    const [row] = await db.select().from(serviceFacilities).where(eq(serviceFacilities.id, id));
    return row;
  }
  async createServiceFacility(input: InsertServiceFacility): Promise<ServiceFacility> {
    const [row] = await db.insert(serviceFacilities).values(input).returning();
    await recordAudit({ action: "create", entityType: "service_facility", entityId: row.id, entityLabel: row.name, fleetId: null, changes: redactSnapshot(row) });
    return row;
  }
  async updateServiceFacility(id: number, input: Partial<InsertServiceFacility>): Promise<ServiceFacility | undefined> {
    const before = await this.getServiceFacility(id);
    const [row] = await db.update(serviceFacilities).set(input).where(eq(serviceFacilities.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "service_facility", entityId: row.id, entityLabel: row.name, fleetId: null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteServiceFacility(id: number): Promise<boolean> {
    const existing = await this.getServiceFacility(id);
    // No ON DELETE CASCADE/SET NULL is declared at the DB level anywhere in this
    // codebase (see deleteFleet()'s comment) — clear the live FK on any service
    // events that reference this facility before deleting it. Their snapshot
    // columns (vendor/technician/facilityAddress/facilityPhone) already preserve
    // the historical display independent of this row.
    await db.update(serviceEvents).set({ serviceFacilityId: null }).where(eq(serviceEvents.serviceFacilityId, id));
    await db.delete(serviceFacilityAddresses).where(eq(serviceFacilityAddresses.facilityId, id));
    const result = await db.delete(serviceFacilities).where(eq(serviceFacilities.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "service_facility", entityId: id, entityLabel: existing.name, fleetId: null, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listServiceFacilityAddresses(facilityId?: number): Promise<ServiceFacilityAddress[]> {
    if (facilityId) {
      return await db.select().from(serviceFacilityAddresses).where(eq(serviceFacilityAddresses.facilityId, facilityId)).orderBy(serviceFacilityAddresses.id);
    }
    return await db.select().from(serviceFacilityAddresses).orderBy(serviceFacilityAddresses.id);
  }
  async getServiceFacilityAddress(id: number): Promise<ServiceFacilityAddress | undefined> {
    const [row] = await db.select().from(serviceFacilityAddresses).where(eq(serviceFacilityAddresses.id, id));
    return row;
  }
  private serviceFacilityAddressLabel(row: ServiceFacilityAddress): string {
    return row.label || row.addressLine || `Address for facility #${row.facilityId}`;
  }
  async createServiceFacilityAddress(input: InsertServiceFacilityAddress): Promise<ServiceFacilityAddress> {
    const [row] = await db.insert(serviceFacilityAddresses).values(input).returning();
    await recordAudit({ action: "create", entityType: "service_facility_address", entityId: row.id, entityLabel: this.serviceFacilityAddressLabel(row), fleetId: null, changes: redactSnapshot(row) });
    return row;
  }
  async updateServiceFacilityAddress(id: number, input: Partial<InsertServiceFacilityAddress>): Promise<ServiceFacilityAddress | undefined> {
    const before = await this.getServiceFacilityAddress(id);
    const [row] = await db.update(serviceFacilityAddresses).set(input).where(eq(serviceFacilityAddresses.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "service_facility_address", entityId: row.id, entityLabel: this.serviceFacilityAddressLabel(row), fleetId: null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteServiceFacilityAddress(id: number): Promise<boolean> {
    const existing = await this.getServiceFacilityAddress(id);
    const result = await db.delete(serviceFacilityAddresses).where(eq(serviceFacilityAddresses.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "service_facility_address", entityId: id, entityLabel: this.serviceFacilityAddressLabel(existing), fleetId: null, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listServiceFacilityTypes(): Promise<ServiceFacilityType[]> {
    return await db.select().from(serviceFacilityTypes).orderBy(serviceFacilityTypes.name);
  }
  async getServiceFacilityType(id: number): Promise<ServiceFacilityType | undefined> {
    const [row] = await db.select().from(serviceFacilityTypes).where(eq(serviceFacilityTypes.id, id));
    return row;
  }
  async createServiceFacilityType(input: InsertServiceFacilityType): Promise<ServiceFacilityType> {
    const [row] = await db.insert(serviceFacilityTypes).values(input).returning();
    await recordAudit({ action: "create", entityType: "service_facility_type", entityId: row.id, entityLabel: row.name, fleetId: null, changes: redactSnapshot(row) });
    return row;
  }
  async updateServiceFacilityType(id: number, input: Partial<InsertServiceFacilityType>): Promise<ServiceFacilityType | undefined> {
    const before = await this.getServiceFacilityType(id);
    const [row] = await db.update(serviceFacilityTypes).set(input).where(eq(serviceFacilityTypes.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "service_facility_type", entityId: row.id, entityLabel: row.name, fleetId: null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteServiceFacilityType(id: number): Promise<boolean> {
    const existing = await this.getServiceFacilityType(id);
    const result = await db.delete(serviceFacilityTypes).where(eq(serviceFacilityTypes.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "service_facility_type", entityId: id, entityLabel: existing.name, fleetId: null, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async getFleetRole(id: number): Promise<FleetRole | undefined> {
    const [row] = await db.select().from(fleetRoles).where(eq(fleetRoles.id, id));
    return row;
  }
  async listFleetRoles(fleetId?: number): Promise<FleetRole[]> {
    if (fleetId) {
      const existing = await db.select().from(fleetRoles).where(eq(fleetRoles.fleetId, fleetId));
      if (existing.length === 0) await this.seedDefaultFleetRoles(fleetId);
    }
    const q = db.select().from(fleetRoles).orderBy(fleetRoles.name);
    return fleetId ? await q.where(eq(fleetRoles.fleetId, fleetId)) : await q;
  }
  async listFleetRolesWithPermissions(fleetId?: number): Promise<(FleetRole & { permissions: string[] })[]> {
    const roles = await this.listFleetRoles(fleetId);
    if (roles.length === 0) return [];
    const permRows = await db.select().from(fleetRolePermissions)
      .where(inArray(fleetRolePermissions.roleId, roles.map(r => r.id)));
    const byRole = new Map<number, string[]>();
    for (const row of permRows) {
      if (!byRole.has(row.roleId)) byRole.set(row.roleId, []);
      byRole.get(row.roleId)!.push(row.permissionKey);
    }
    return roles.map(r => ({ ...r, permissions: byRole.get(r.id) ?? [] }));
  }
  async createFleetRole(input: InsertFleetRole): Promise<FleetRole> {
    const [row] = await db.insert(fleetRoles).values(input).returning();
    await recordAudit({ action: "create", entityType: "fleet_role", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateFleetRole(id: number, input: Partial<InsertFleetRole>): Promise<FleetRole | undefined> {
    const before = await this.getFleetRole(id);
    const [row] = await db.update(fleetRoles).set(input).where(eq(fleetRoles.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "fleet_role", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteFleetRole(id: number): Promise<boolean> {
    const [existing] = await db.select().from(fleetRoles).where(eq(fleetRoles.id, id));
    if (existing && (await isAdminRoleId(id))) {
      const otherMemberships = await db.select().from(fleetMemberships)
        .where(and(eq(fleetMemberships.fleetId, existing.fleetId), ne(fleetMemberships.roleId, id)));
      const membersOfThisRole = await db.select().from(fleetMemberships)
        .where(and(eq(fleetMemberships.fleetId, existing.fleetId), eq(fleetMemberships.roleId, id)));
      let otherAdminCount = 0;
      for (const m of otherMemberships) {
        if (await isAdminRoleId(m.roleId)) otherAdminCount++;
      }
      if (membersOfThisRole.length > 0 && otherAdminCount === 0) {
        throw new Error("cannot_remove_last_fleet_admin");
      }
    }
    await db.delete(fleetRolePermissions).where(eq(fleetRolePermissions.roleId, id));
    const result = await db.delete(fleetRoles).where(eq(fleetRoles.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "fleet_role", entityId: id, entityLabel: existing.name, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async setFleetRolePermissions(roleId: number, keys: string[]): Promise<void> {
    const [role] = await db.select().from(fleetRoles).where(eq(fleetRoles.id, roleId));
    if (!role) throw new Error("fleet_role_not_found");
    const wasAdmin = await isAdminRoleId(roleId);
    if (wasAdmin && !keys.includes("roles.manage" satisfies PermissionKey)) {
      const memberships = await db.select().from(fleetMemberships).where(eq(fleetMemberships.fleetId, role.fleetId));
      const membersOfThisRole = memberships.filter(m => m.roleId === roleId);
      const otherMemberships = memberships.filter(m => m.roleId !== roleId);
      let otherAdminCount = 0;
      for (const m of otherMemberships) {
        if (await isAdminRoleId(m.roleId)) otherAdminCount++;
      }
      if (membersOfThisRole.length > 0 && otherAdminCount === 0) {
        throw new Error("cannot_remove_last_fleet_admin");
      }
    }
    await db.delete(fleetRolePermissions).where(eq(fleetRolePermissions.roleId, roleId));
    for (const key of keys) {
      await db.insert(fleetRolePermissions).values({ roleId, permissionKey: key });
    }
  }

  async listInventoryCategories(fleetId?: number): Promise<InventoryCategory[]> {
    const q = db.select().from(inventoryCategories).orderBy(inventoryCategories.sortOrder, inventoryCategories.name);
    return fleetId ? await q.where(eq(inventoryCategories.fleetId, fleetId)) : await q;
  }
  async getInventoryCategory(id: number): Promise<InventoryCategory | undefined> {
    const [row] = await db.select().from(inventoryCategories).where(eq(inventoryCategories.id, id));
    return row;
  }
  async createInventoryCategory(input: InsertInventoryCategory): Promise<InventoryCategory> {
    const [row] = await db.insert(inventoryCategories).values(input).returning();
    await recordAudit({ action: "create", entityType: "inventory_category", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateInventoryCategory(id: number, input: Partial<InsertInventoryCategory>): Promise<InventoryCategory | undefined> {
    const before = await this.getInventoryCategory(id);
    const [row] = await db.update(inventoryCategories).set(input).where(eq(inventoryCategories.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "inventory_category", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteInventoryCategory(id: number): Promise<boolean> {
    const existing = await this.getInventoryCategory(id);
    await db.delete(inventoryCategoryFields).where(eq(inventoryCategoryFields.categoryId, id));
    const result = await db.delete(inventoryCategories).where(eq(inventoryCategories.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "inventory_category", entityId: id, entityLabel: existing.name, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listInventoryCategoryFields(categoryId?: number, fleetId?: number): Promise<InventoryCategoryField[]> {
    if (categoryId != null) {
      return db.select().from(inventoryCategoryFields).where(eq(inventoryCategoryFields.categoryId, categoryId))
        .orderBy(inventoryCategoryFields.sortOrder, inventoryCategoryFields.name);
    }
    if (fleetId != null) {
      const rows = await db.select({ f: inventoryCategoryFields }).from(inventoryCategoryFields)
        .innerJoin(inventoryCategories, eq(inventoryCategories.id, inventoryCategoryFields.categoryId))
        .where(eq(inventoryCategories.fleetId, fleetId))
        .orderBy(inventoryCategoryFields.sortOrder, inventoryCategoryFields.name);
      return rows.map(row => row.f);
    }
    return db.select().from(inventoryCategoryFields).orderBy(inventoryCategoryFields.sortOrder, inventoryCategoryFields.name);
  }
  async getInventoryCategoryField(id: number): Promise<InventoryCategoryField | undefined> {
    const [row] = await db.select().from(inventoryCategoryFields).where(eq(inventoryCategoryFields.id, id));
    return row;
  }
  private async fleetIdForCategory(categoryId: number): Promise<number | null> {
    const category = await this.getInventoryCategory(categoryId);
    return category?.fleetId ?? null;
  }
  async createInventoryCategoryField(input: InsertInventoryCategoryField): Promise<InventoryCategoryField> {
    if (input.highlightField) {
      await db.update(inventoryCategoryFields).set({ highlightField: false }).where(eq(inventoryCategoryFields.categoryId, input.categoryId));
    }
    const [row] = await db.insert(inventoryCategoryFields).values(input).returning();
    await recordAudit({ action: "create", entityType: "inventory_category_field", entityId: row.id, entityLabel: row.name, fleetId: await this.fleetIdForCategory(row.categoryId), changes: redactSnapshot(row) });
    return row;
  }
  async updateInventoryCategoryField(id: number, input: Partial<InsertInventoryCategoryField>): Promise<InventoryCategoryField | undefined> {
    const before = await this.getInventoryCategoryField(id);
    if (input.highlightField && before) {
      await db.update(inventoryCategoryFields)
        .set({ highlightField: false })
        .where(and(eq(inventoryCategoryFields.categoryId, before.categoryId), ne(inventoryCategoryFields.id, id)));
    }
    const [row] = await db.update(inventoryCategoryFields).set(input).where(eq(inventoryCategoryFields.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "inventory_category_field", entityId: row.id, entityLabel: row.name, fleetId: await this.fleetIdForCategory(row.categoryId), changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteInventoryCategoryField(id: number): Promise<boolean> {
    const existing = await this.getInventoryCategoryField(id);
    const result = await db.delete(inventoryCategoryFields).where(eq(inventoryCategoryFields.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "inventory_category_field", entityId: id, entityLabel: existing.name, fleetId: await this.fleetIdForCategory(existing.categoryId), changes: redactSnapshot(existing) });
    }
    return removed;
  }

  // -- assets ----
  async listAssets(fleetId?: number): Promise<Asset[]> {
    const q = db.select().from(assets).orderBy(assets.friendlyName);
    return fleetId ? await q.where(eq(assets.fleetId, fleetId)) : await q;
  }
  async getAsset(id: number): Promise<Asset | undefined> {
    const [row] = await db.select().from(assets).where(eq(assets.id, id));
    return row;
  }
  async createAsset(input: InsertAsset): Promise<Asset> {
    const [row] = await db.insert(assets).values(input).returning();
    await recordAudit({ action: "create", entityType: "asset", entityId: row.id, entityLabel: row.friendlyName || row.vin || `Asset #${row.id}`, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateAsset(id: number, input: Partial<InsertAsset>): Promise<Asset | undefined> {
    const before = await this.getAsset(id);
    const [row] = await db.update(assets).set(input).where(eq(assets.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "asset", entityId: row.id, entityLabel: row.friendlyName || row.vin || `Asset #${row.id}`, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteAsset(id: number): Promise<boolean> {
    const existing = await this.getAsset(id);
    const result = await db.delete(assets).where(eq(assets.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "asset", entityId: id, entityLabel: existing.friendlyName || existing.vin || `Asset #${id}`, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }

  // -- meter readings ----
  async listMeterReadings(assetId?: number, fleetId?: number): Promise<MeterReading[]> {
    if (assetId != null) {
      return db.select().from(meterReadings).where(eq(meterReadings.assetId, assetId)).orderBy(desc(meterReadings.readingDate));
    }
    if (fleetId != null) {
      const rows = await db.select({ r: meterReadings }).from(meterReadings)
        .innerJoin(assets, eq(assets.id, meterReadings.assetId))
        .where(eq(assets.fleetId, fleetId))
        .orderBy(desc(meterReadings.readingDate));
      return rows.map(row => row.r);
    }
    return db.select().from(meterReadings).orderBy(desc(meterReadings.readingDate));
  }
  async getMeterReading(id: number): Promise<MeterReading | undefined> {
    const [row] = await db.select().from(meterReadings).where(eq(meterReadings.id, id));
    return row;
  }
  async updateMeterReading(id: number, input: Partial<InsertMeterReading>): Promise<MeterReading | undefined> {
    const before = await this.getMeterReading(id);
    const [updated] = await db.update(meterReadings).set(input).where(eq(meterReadings.id, id)).returning();
    if (updated) {
      const asset = await this.refreshAssetMeterFromReadings(updated.assetId);
      if (before) {
        await recordAudit({ action: "update", entityType: "meter_reading", entityId: updated.id, entityLabel: `${updated.value} ${updated.readingType}`, fleetId: asset?.fleetId ?? null, changes: diffChanges(before, updated) });
      }
    }
    return updated;
  }
  async deleteMeterReading(id: number): Promise<boolean> {
    const existing = await this.getMeterReading(id);
    const result = await db.delete(meterReadings).where(eq(meterReadings.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      const asset = await this.refreshAssetMeterFromReadings(existing.assetId);
      await recordAudit({ action: "delete", entityType: "meter_reading", entityId: id, entityLabel: `${existing.value} ${existing.readingType}`, fleetId: asset?.fleetId ?? null, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  private async refreshAssetMeterFromReadings(assetId: number): Promise<Asset | undefined> {
    const asset = await this.getAsset(assetId);
    if (!asset) return undefined;
    // Find most recent remaining reading; if none, leave as-is.
    const [latest] = await db.select().from(meterReadings)
      .where(eq(meterReadings.assetId, assetId))
      .orderBy(desc(meterReadings.readingDate))
      .limit(1);
    if (latest) {
      await db.update(assets)
        .set({ currentMeter: latest.value, meterAsOf: latest.readingDate, meterType: latest.readingType })
        .where(eq(assets.id, assetId));
    }
    return asset;
  }
  async createMeterReading(input: InsertMeterReading): Promise<MeterReading> {
    const [reading] = await db.insert(meterReadings).values(input).returning();
    // Bump asset.currentMeter if newer/higher.
    const asset = await this.getAsset(input.assetId);
    if (asset) {
      const incomingDate = new Date(input.readingDate).getTime();
      const existingDate = asset.meterAsOf ? new Date(asset.meterAsOf).getTime() : 0;
      if (input.value >= asset.currentMeter || incomingDate >= existingDate) {
        await db.update(assets)
          .set({ currentMeter: input.value, meterAsOf: input.readingDate, meterType: input.readingType })
          .where(eq(assets.id, asset.id));
      }
    }
    await recordAudit({ action: "create", entityType: "meter_reading", entityId: reading.id, entityLabel: `${reading.value} ${reading.readingType}`, fleetId: asset?.fleetId ?? null, changes: redactSnapshot(reading) });
    return reading;
  }

  // -- schedules ----
  //
  // listSchedules(assetId) returns the *effective* list of schedules visible
  // on an asset detail page: asset-scoped rows whose assetId === assetId,
  // plus fleet-scoped rows assigned to assetId via the assignments table.
  async listSchedules(assetId?: number): Promise<MaintenanceSchedule[]> {
    if (assetId == null) {
      return db.select().from(maintenanceSchedules).orderBy(maintenanceSchedules.name);
    }
    return this.listSchedulesAssignedToAsset(assetId);
  }
  async listSchedulesAssignedToAsset(assetId: number): Promise<MaintenanceSchedule[]> {
    const ownRows = await db.select().from(maintenanceSchedules)
      .where(and(eq(maintenanceSchedules.assetId, assetId), eq(maintenanceSchedules.scope, "asset")));
    const assignedRowsRaw = await db.select({ s: maintenanceSchedules })
      .from(maintenanceScheduleAssignments)
      .innerJoin(maintenanceSchedules, eq(maintenanceSchedules.id, maintenanceScheduleAssignments.scheduleId))
      .where(eq(maintenanceScheduleAssignments.assetId, assetId));
    const assignedRows = assignedRowsRaw.map(r => r.s);
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
  async listAllSchedulesForFleet(fleetId: number): Promise<MaintenanceSchedule[]> {
    return db.select().from(maintenanceSchedules)
      .where(eq(maintenanceSchedules.fleetId, fleetId))
      .orderBy(maintenanceSchedules.name);
  }
  async getSchedule(id: number): Promise<MaintenanceSchedule | undefined> {
    const [row] = await db.select().from(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
    return row;
  }
  async createSchedule(input: InsertMaintenanceSchedule): Promise<MaintenanceSchedule> {
    const scope = input.scope ?? "asset";
    // For asset schedules, derive fleetId from the asset for consistency.
    let fleetId = input.fleetId ?? null;
    if (scope === "asset" && input.assetId && fleetId == null) {
      const asset = await this.getAsset(input.assetId);
      fleetId = asset?.fleetId ?? null;
    }
    const values = {
      ...input,
      scope,
      fleetId,
      // Fleet schedules have no single assetId.
      assetId: scope === "fleet" ? null : input.assetId ?? null,
    } as InsertMaintenanceSchedule;
    const [row] = await db.insert(maintenanceSchedules).values(values).returning();
    await recordAudit({ action: "create", entityType: "maintenance_schedule", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateSchedule(id: number, input: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule | undefined> {
    const before = await this.getSchedule(id);
    const [row] = await db.update(maintenanceSchedules).set(input).where(eq(maintenanceSchedules.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "maintenance_schedule", entityId: row.id, entityLabel: row.name, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteSchedule(id: number): Promise<boolean> {
    const existing = await this.getSchedule(id);
    // Cascade: remove assignments for this schedule.
    await db.delete(maintenanceScheduleAssignments).where(eq(maintenanceScheduleAssignments.scheduleId, id));
    const result = await db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "maintenance_schedule", entityId: id, entityLabel: existing.name, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }

  async listScheduleAssignments(scheduleId?: number, fleetId?: number): Promise<MaintenanceScheduleAssignment[]> {
    if (scheduleId != null) {
      return db.select().from(maintenanceScheduleAssignments).where(eq(maintenanceScheduleAssignments.scheduleId, scheduleId));
    }
    if (fleetId != null) {
      const rows = await db.select({ a: maintenanceScheduleAssignments }).from(maintenanceScheduleAssignments)
        .innerJoin(maintenanceSchedules, eq(maintenanceSchedules.id, maintenanceScheduleAssignments.scheduleId))
        .where(eq(maintenanceSchedules.fleetId, fleetId));
      return rows.map(row => row.a);
    }
    return db.select().from(maintenanceScheduleAssignments);
  }
  async setScheduleAssignments(scheduleId: number, assetIds: number[]): Promise<MaintenanceScheduleAssignment[]> {
    // Replace assignments wholesale (idempotent).
    await db.delete(maintenanceScheduleAssignments).where(eq(maintenanceScheduleAssignments.scheduleId, scheduleId));
    const unique = Array.from(new Set(assetIds.filter(id => Number.isFinite(id))));
    for (const assetId of unique) {
      await db.insert(maintenanceScheduleAssignments).values({ scheduleId, assetId });
    }
    return this.listScheduleAssignments(scheduleId);
  }
  async promoteScheduleToFleet(scheduleId: number, additionalAssetIds: number[]): Promise<MaintenanceSchedule> {
    const existing = await this.getSchedule(scheduleId);
    if (!existing) throw new Error("schedule_not_found");
    if (existing.scope === "fleet") return existing;
    const originatingAsset = existing.assetId;
    let fleetId = existing.fleetId;
    if (!fleetId && originatingAsset) {
      const a = await this.getAsset(originatingAsset);
      fleetId = a?.fleetId ?? null;
    }
    // Convert the row in-place to a fleet schedule.
    await db.update(maintenanceSchedules).set({ scope: "fleet", fleetId, assetId: null })
      .where(eq(maintenanceSchedules.id, scheduleId));
    // Preserve continuity: assign back to the originating asset + any new ones.
    const assetIds = Array.from(new Set([
      ...(originatingAsset ? [originatingAsset] : []),
      ...additionalAssetIds,
    ]));
    await this.setScheduleAssignments(scheduleId, assetIds);
    return (await this.getSchedule(scheduleId))!;
  }

  // -- service events ----
  async listServiceEvents(assetId?: number, fleetId?: number): Promise<ServiceEvent[]> {
    if (assetId != null) {
      return db.select().from(serviceEvents).where(eq(serviceEvents.assetId, assetId)).orderBy(desc(serviceEvents.performedAt));
    }
    if (fleetId != null) {
      const rows = await db.select({ e: serviceEvents }).from(serviceEvents)
        .innerJoin(assets, eq(assets.id, serviceEvents.assetId))
        .where(eq(assets.fleetId, fleetId))
        .orderBy(desc(serviceEvents.performedAt));
      return rows.map(row => row.e);
    }
    return db.select().from(serviceEvents).orderBy(desc(serviceEvents.performedAt));
  }
  async getServiceEvent(id: number): Promise<ServiceEvent | undefined> {
    const [row] = await db.select().from(serviceEvents).where(eq(serviceEvents.id, id));
    return row;
  }
  async createServiceEvent(input: InsertServiceEvent): Promise<ServiceEvent> {
    const [event] = await db.insert(serviceEvents).values(input).returning();
    const asset = await this.getAsset(input.assetId);
    // Auto-create a meter reading when the service captured one.
    if (input.meterAtService != null) {
      await this.createMeterReading({
        assetId: input.assetId,
        readingType: asset?.meterType ?? "mileage",
        value: input.meterAtService,
        readingDate: input.performedAt,
        notes: `Recorded with service: ${input.title}`,
        source: "service-event",
      } as InsertMeterReading);
    }
    await recordAudit({ action: "create", entityType: "service_event", entityId: event.id, entityLabel: event.title, fleetId: asset?.fleetId ?? null, changes: redactSnapshot(event) });
    return event;
  }
  async updateServiceEvent(id: number, input: Partial<InsertServiceEvent>): Promise<ServiceEvent | undefined> {
    const before = await this.getServiceEvent(id);
    const [row] = await db.update(serviceEvents).set(input).where(eq(serviceEvents.id, id)).returning();
    if (row && before) {
      const asset = await this.getAsset(row.assetId);
      await recordAudit({ action: "update", entityType: "service_event", entityId: row.id, entityLabel: row.title, fleetId: asset?.fleetId ?? null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteServiceEvent(id: number): Promise<boolean> {
    const event = await this.getServiceEvent(id);
    // Restore any consumed inventory (mirroring replaceLineItems behavior) and remove line items + movements.
    const existing = await this.listLineItems(id);
    for (const line of existing) {
      if (line.inventoryItemId) {
        await db.update(inventoryItems)
          .set({ onHand: sql`${inventoryItems.onHand} + ${line.quantity}` })
          .where(eq(inventoryItems.id, line.inventoryItemId));
      }
    }
    await db.delete(inventoryMovements).where(eq(inventoryMovements.serviceEventId, id));
    await db.delete(serviceLineItems).where(eq(serviceLineItems.serviceEventId, id));
    const result = await db.delete(serviceEvents).where(eq(serviceEvents.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && event) {
      const asset = await this.getAsset(event.assetId);
      await recordAudit({ action: "delete", entityType: "service_event", entityId: id, entityLabel: event.title, fleetId: asset?.fleetId ?? null, changes: redactSnapshot(event) });
    }
    return removed;
  }
  async listLineItems(serviceEventId?: number, assetId?: number): Promise<ServiceLineItem[]> {
    if (serviceEventId != null) {
      return db.select().from(serviceLineItems).where(eq(serviceLineItems.serviceEventId, serviceEventId));
    }
    if (assetId != null) {
      const rows = await db.select({ l: serviceLineItems }).from(serviceLineItems)
        .innerJoin(serviceEvents, eq(serviceEvents.id, serviceLineItems.serviceEventId))
        .where(eq(serviceEvents.assetId, assetId));
      return rows.map(row => row.l);
    }
    return db.select().from(serviceLineItems);
  }
  async getLineItem(id: number): Promise<ServiceLineItem | undefined> {
    const [row] = await db.select().from(serviceLineItems).where(eq(serviceLineItems.id, id));
    return row;
  }
  async createLineItem(input: InsertServiceLineItem): Promise<ServiceLineItem> {
    const [line] = await db.insert(serviceLineItems).values(input).returning();
    const event = await this.getServiceEvent(input.serviceEventId);
    if (input.inventoryItemId) {
      // Decrement stock and record movement.
      await db.update(inventoryItems)
        .set({ onHand: sql`${inventoryItems.onHand} - ${input.quantity}` })
        .where(eq(inventoryItems.id, input.inventoryItemId));
      await db.insert(inventoryMovements).values({
        inventoryItemId: input.inventoryItemId,
        movementType: "consumption",
        quantity: -input.quantity,
        serviceEventId: input.serviceEventId,
        occurredAt: event?.performedAt ?? new Date(),
        notes: `Consumed by service event #${input.serviceEventId}`,
      });
    }
    const asset = event ? await this.getAsset(event.assetId) : undefined;
    await recordAudit({ action: "create", entityType: "service_line_item", entityId: line.id, entityLabel: line.itemName, fleetId: asset?.fleetId ?? null, changes: redactSnapshot(line) });
    return line;
  }
  async replaceLineItems(serviceEventId: number, input: InsertServiceLineItem[]): Promise<ServiceLineItem[]> {
    const existing = await this.listLineItems(serviceEventId);
    for (const line of existing) {
      if (line.inventoryItemId) {
        await db.update(inventoryItems)
          .set({ onHand: sql`${inventoryItems.onHand} + ${line.quantity}` })
          .where(eq(inventoryItems.id, line.inventoryItemId));
      }
    }
    await db.delete(inventoryMovements)
      .where(and(eq(inventoryMovements.serviceEventId, serviceEventId), eq(inventoryMovements.movementType, "consumption")));
    await db.delete(serviceLineItems).where(eq(serviceLineItems.serviceEventId, serviceEventId));
    const created: ServiceLineItem[] = [];
    for (const line of input) {
      created.push(await this.createLineItem({ ...line, serviceEventId }));
    }
    return created;
  }

  // -- inventory ----
  async listInventoryItems(fleetId?: number): Promise<InventoryItem[]> {
    const q = db.select().from(inventoryItems).orderBy(inventoryItems.name);
    return fleetId ? await q.where(eq(inventoryItems.fleetId, fleetId)) : await q;
  }
  async getInventoryItem(id: number): Promise<InventoryItem | undefined> {
    const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
    return row;
  }
  async createInventoryItem(input: InsertInventoryItem): Promise<InventoryItem> {
    const [row] = await db.insert(inventoryItems).values(input).returning();
    await recordAudit({ action: "create", entityType: "inventory_item", entityId: row.id, entityLabel: row.displayName || row.name, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateInventoryItem(id: number, input: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const before = await this.getInventoryItem(id);
    const [row] = await db.update(inventoryItems).set(input).where(eq(inventoryItems.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "inventory_item", entityId: row.id, entityLabel: row.displayName || row.name, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteInventoryItem(id: number): Promise<boolean> {
    const existing = await this.getInventoryItem(id);
    const result = await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "inventory_item", entityId: id, entityLabel: existing.displayName || existing.name, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }
  async listInventoryMovements(itemId?: number): Promise<InventoryMovement[]> {
    const q = db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.occurredAt));
    return itemId ? await q.where(eq(inventoryMovements.inventoryItemId, itemId)) : await q;
  }
  async getInventoryMovement(id: number): Promise<InventoryMovement | undefined> {
    const [row] = await db.select().from(inventoryMovements).where(eq(inventoryMovements.id, id));
    return row;
  }
  async createInventoryMovement(input: InsertInventoryMovement): Promise<InventoryMovement> {
    const [movement] = await db.insert(inventoryMovements).values(input).returning();
    await db.update(inventoryItems)
      .set({ onHand: sql`${inventoryItems.onHand} + ${input.quantity}` })
      .where(eq(inventoryItems.id, input.inventoryItemId));
    const item = await this.getInventoryItem(input.inventoryItemId);
    const label = `${movement.movementType} ${movement.quantity}${item ? ` — ${item.displayName || item.name}` : ""}`;
    await recordAudit({ action: "create", entityType: "inventory_movement", entityId: movement.id, entityLabel: label, fleetId: item?.fleetId ?? null, changes: redactSnapshot(movement) });
    return movement;
  }

  // -- attachments ----
  async listAttachments(entityType?: string, entityId?: number): Promise<Attachment[]> {
    const rows = await db.select().from(attachments).orderBy(desc(attachments.createdAt));
    return rows.filter(a =>
      (!entityType || a.entityType === entityType) &&
      (!entityId || a.entityId === entityId)
    );
  }
  // Attachments are polymorphic (entityType/entityId, no direct fleetId column) —
  // resolve fleetId by walking to whichever concrete entity they're attached to.
  private async fleetIdForAttachmentTarget(entityType: string, entityId: number): Promise<number | null> {
    if (entityType === "inventory-item") {
      const item = await this.getInventoryItem(entityId);
      return item?.fleetId ?? null;
    }
    if (entityType === "service-event") {
      const event = await this.getServiceEvent(entityId);
      if (!event) return null;
      const asset = await this.getAsset(event.assetId);
      return asset?.fleetId ?? null;
    }
    if (entityType === "inventory-movement") {
      const movement = await this.getInventoryMovement(entityId);
      if (!movement) return null;
      const item = await this.getInventoryItem(movement.inventoryItemId);
      return item?.fleetId ?? null;
    }
    return null;
  }
  async createAttachment(input: InsertAttachment): Promise<Attachment> {
    const [row] = await db.insert(attachments).values(input).returning();
    await recordAudit({ action: "create", entityType: "attachment", entityId: row.id, entityLabel: row.fileName, fleetId: await this.fleetIdForAttachmentTarget(row.entityType, row.entityId), changes: redactSnapshot(row) });
    return row;
  }

  // -- settings ----
  async listAppSettings(): Promise<AppSetting[]> {
    return db.select().from(appSettings);
  }
  async upsertAppSetting(input: InsertAppSetting): Promise<AppSetting> {
    const [existing] = await db.select().from(appSettings).where(eq(appSettings.key, input.key));
    if (existing) {
      const [updated] = await db.update(appSettings).set({ value: input.value, updatedAt: input.updatedAt })
        .where(eq(appSettings.key, input.key)).returning();
      // appSettings has no integer id (key is the text primary key) — entityId
      // has no natural value here, so 0 is used as a placeholder; the key
      // itself is carried in entityLabel.
      await recordAudit({ action: "update", entityType: "app_setting", entityId: 0, entityLabel: input.key, fleetId: null, changes: diffChanges(existing, updated) });
      return updated;
    }
    const [created] = await db.insert(appSettings).values(input).returning();
    await recordAudit({ action: "create", entityType: "app_setting", entityId: 0, entityLabel: input.key, fleetId: null, changes: redactSnapshot(created) });
    return created;
  }

  // -- auth: system settings (singleton row) ----
  async getSystemSettings(): Promise<SystemSettings> {
    const [existing] = await db.select().from(systemSettings).orderBy(systemSettings.id).limit(1);
    if (existing) return existing;
    const [created] = await db.insert(systemSettings).values({}).returning();
    return created;
  }
  async updateSystemSettings(patch: Partial<InsertSystemSettings>): Promise<SystemSettings> {
    const existing = await this.getSystemSettings();
    const [updated] = await db.update(systemSettings).set(patch).where(eq(systemSettings.id, existing.id)).returning();
    await recordAudit({ action: "update", entityType: "system_settings", entityId: updated.id, entityLabel: "System Settings", fleetId: null, changes: diffChanges(existing, updated) });
    return updated;
  }

  // -- auth: OIDC group mappings ----
  async listOidcGroupMappings(): Promise<OidcGroupMapping[]> {
    return db.select().from(oidcGroupMappings).orderBy(oidcGroupMappings.groupName);
  }
  async getOidcGroupMapping(id: number): Promise<OidcGroupMapping | undefined> {
    const [row] = await db.select().from(oidcGroupMappings).where(eq(oidcGroupMappings.id, id));
    return row;
  }
  async createOidcGroupMapping(input: InsertOidcGroupMapping): Promise<OidcGroupMapping> {
    const [row] = await db.insert(oidcGroupMappings).values(input).returning();
    await recordAudit({ action: "create", entityType: "oidc_group_mapping", entityId: row.id, entityLabel: row.groupName, fleetId: row.fleetId, changes: redactSnapshot(row) });
    return row;
  }
  async updateOidcGroupMapping(id: number, input: Partial<InsertOidcGroupMapping>): Promise<OidcGroupMapping | undefined> {
    const before = await this.getOidcGroupMapping(id);
    const [row] = await db.update(oidcGroupMappings).set(input).where(eq(oidcGroupMappings.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "oidc_group_mapping", entityId: row.id, entityLabel: row.groupName, fleetId: row.fleetId, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteOidcGroupMapping(id: number): Promise<boolean> {
    const existing = await this.getOidcGroupMapping(id);
    const result = await db.delete(oidcGroupMappings).where(eq(oidcGroupMappings.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "oidc_group_mapping", entityId: id, entityLabel: existing.groupName, fleetId: existing.fleetId, changes: redactSnapshot(existing) });
    }
    return removed;
  }

  // -- audit log ----
  async listAuditLog(filters: AuditLogFilters): Promise<{ rows: AuditLog[]; total: number }> {
    const conditions = [];
    if (filters.fleetId != null) conditions.push(eq(auditLog.fleetId, filters.fleetId));
    if (filters.entityType) conditions.push(eq(auditLog.entityType, filters.entityType));
    if (filters.actorUserId != null) conditions.push(eq(auditLog.actorUserId, filters.actorUserId));
    if (filters.action) conditions.push(eq(auditLog.action, filters.action));
    if (filters.from) {
      const fromDate = new Date(filters.from);
      if (!Number.isNaN(fromDate.getTime())) conditions.push(gte(auditLog.createdAt, fromDate));
    }
    if (filters.to) {
      const toDate = new Date(filters.to);
      if (!Number.isNaN(toDate.getTime())) conditions.push(lte(auditLog.createdAt, toDate));
    }
    const where = conditions.length ? and(...conditions) : undefined;

    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const rowsQuery = db.select().from(auditLog).orderBy(desc(auditLog.createdAt)).limit(limit).offset(offset);
    const countQuery = db.select({ count: sql<number>`count(*)`.mapWith(Number) }).from(auditLog);

    const [rows, countRows] = await Promise.all([
      where ? rowsQuery.where(where) : rowsQuery,
      where ? countQuery.where(where) : countQuery,
    ]);
    return { rows, total: countRows[0]?.count ?? 0 };
  }

  // -- lookup providers (Privacy & Lookups) ----
  async listLookupProviders(category?: string): Promise<LookupProvider[]> {
    const q = db.select().from(lookupProviders).orderBy(lookupProviders.name);
    return category ? await q.where(eq(lookupProviders.category, category)) : await q;
  }
  async getLookupProvider(id: number): Promise<LookupProvider | undefined> {
    const [row] = await db.select().from(lookupProviders).where(eq(lookupProviders.id, id));
    return row;
  }
  async createLookupProvider(input: InsertLookupProvider): Promise<LookupProvider> {
    const [row] = await db.insert(lookupProviders).values(input).returning();
    await recordAudit({ action: "create", entityType: "lookup_provider", entityId: row.id, entityLabel: row.name, fleetId: null, changes: redactSnapshot(row) });
    return row;
  }
  async updateLookupProvider(id: number, input: Partial<InsertLookupProvider>): Promise<LookupProvider | undefined> {
    const before = await this.getLookupProvider(id);
    const [row] = await db.update(lookupProviders).set(input).where(eq(lookupProviders.id, id)).returning();
    if (row && before) {
      await recordAudit({ action: "update", entityType: "lookup_provider", entityId: row.id, entityLabel: row.name, fleetId: null, changes: diffChanges(before, row) });
    }
    return row;
  }
  async deleteLookupProvider(id: number): Promise<boolean> {
    const existing = await this.getLookupProvider(id);
    // Silent fallback to Built-in for whichever category had this provider
    // selected — no "in use" block, per the earlier decision.
    await db.update(systemSettings).set({ zipLookupSelectedProviderId: null }).where(eq(systemSettings.zipLookupSelectedProviderId, id));
    await db.update(systemSettings).set({ geocodingSelectedProviderId: null }).where(eq(systemSettings.geocodingSelectedProviderId, id));
    await db.update(systemSettings).set({ nhtsaLookupSelectedProviderId: null }).where(eq(systemSettings.nhtsaLookupSelectedProviderId, id));
    const result = await db.delete(lookupProviders).where(eq(lookupProviders.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) {
      await recordAudit({ action: "delete", entityType: "lookup_provider", entityId: id, entityLabel: existing.name, fleetId: null, changes: redactSnapshot(existing) });
    }
    return removed;
  }
}

export const storage = new DatabaseStorage();

// ---------------------------------------------------------------------------
// Startup: run pending migrations, then backfill.
// ---------------------------------------------------------------------------

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "migrations") });
}

export async function initStorage() {
  await runMigrations();
  await ensureEveryFleetHasAdmin();
}

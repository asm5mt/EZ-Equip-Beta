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
import type { PermissionKey } from "@shared/permissions";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import path from "node:path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    "fleets.manage_settings", "users.manage", "roles.manage",
  ],
};

// A role is admin-equivalent for the last-fleet-admin safety net iff it can
// manage roles/access — that's the one thing a fleet can never be left without.
async function isAdminRoleId(roleId: number): Promise<boolean> {
  const [row] = await db.select().from(fleetRolePermissions)
    .where(and(eq(fleetRolePermissions.roleId, roleId), eq(fleetRolePermissions.permissionKey, "roles.manage" satisfies PermissionKey)));
  return !!row;
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

// ---------------------------------------------------------------------------
// Storage interface
// ---------------------------------------------------------------------------

export interface IStorage {
  // fleets / sites
  listFleets(): Promise<Fleet[]>;
  getFleet(id: number): Promise<Fleet | undefined>;
  updateFleet(id: number, input: Partial<InsertFleet>): Promise<Fleet | undefined>;
  createFleet(input: InsertFleet): Promise<Fleet>;

  listSites(fleetId: number): Promise<Site[]>;
  createSite(input: InsertSite): Promise<Site>;

  // users / memberships
  listUsers(): Promise<User[]>;
  createUser(input: InsertUser): Promise<User>;
  deleteUser(id: number): Promise<boolean>;
  listFleetMemberships(): Promise<FleetMembership[]>;
  upsertFleetMembership(input: InsertFleetMembership): Promise<FleetMembership>;
  deleteFleetMembership(fleetId: number, userId: number): Promise<boolean>;
  listFleetEquipmentTypes(fleetId?: number): Promise<FleetEquipmentType[]>;
  createFleetEquipmentType(input: InsertFleetEquipmentType): Promise<FleetEquipmentType>;
  updateFleetEquipmentType(id: number, input: Partial<InsertFleetEquipmentType>): Promise<FleetEquipmentType | undefined>;
  deleteFleetEquipmentType(id: number): Promise<boolean>;
  listFleetFuelTypes(fleetId?: number): Promise<FleetFuelType[]>;
  createFleetFuelType(input: InsertFleetFuelType): Promise<FleetFuelType>;
  updateFleetFuelType(id: number, input: Partial<InsertFleetFuelType>): Promise<FleetFuelType | undefined>;
  deleteFleetFuelType(id: number): Promise<boolean>;
  listFleetRoles(fleetId?: number): Promise<FleetRole[]>;
  getFleetRole(id: number): Promise<FleetRole | undefined>;
  listFleetRolesWithPermissions(fleetId?: number): Promise<(FleetRole & { permissions: string[] })[]>;
  createFleetRole(input: InsertFleetRole): Promise<FleetRole>;
  updateFleetRole(id: number, input: Partial<InsertFleetRole>): Promise<FleetRole | undefined>;
  deleteFleetRole(id: number): Promise<boolean>;
  setFleetRolePermissions(roleId: number, keys: string[]): Promise<void>;
  listInventoryCategories(fleetId?: number): Promise<InventoryCategory[]>;
  createInventoryCategory(input: InsertInventoryCategory): Promise<InventoryCategory>;
  updateInventoryCategory(id: number, input: Partial<InsertInventoryCategory>): Promise<InventoryCategory | undefined>;
  deleteInventoryCategory(id: number): Promise<boolean>;
  listInventoryCategoryFields(categoryId?: number): Promise<InventoryCategoryField[]>;
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
  listMeterReadings(assetId?: number): Promise<MeterReading[]>;
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
  listScheduleAssignments(scheduleId?: number): Promise<MaintenanceScheduleAssignment[]>;
  setScheduleAssignments(scheduleId: number, assetIds: number[]): Promise<MaintenanceScheduleAssignment[]>;
  promoteScheduleToFleet(scheduleId: number, additionalAssetIds: number[]): Promise<MaintenanceSchedule>;

  // service events
  listServiceEvents(assetId?: number): Promise<ServiceEvent[]>;
  getServiceEvent(id: number): Promise<ServiceEvent | undefined>;
  createServiceEvent(input: InsertServiceEvent): Promise<ServiceEvent>;
  updateServiceEvent(id: number, input: Partial<InsertServiceEvent>): Promise<ServiceEvent | undefined>;
  deleteServiceEvent(id: number): Promise<boolean>;
  listLineItems(serviceEventId?: number): Promise<ServiceLineItem[]>;
  createLineItem(input: InsertServiceLineItem): Promise<ServiceLineItem>;
  replaceLineItems(serviceEventId: number, input: InsertServiceLineItem[]): Promise<ServiceLineItem[]>;

  // inventory
  listInventoryItems(fleetId?: number): Promise<InventoryItem[]>;
  getInventoryItem(id: number): Promise<InventoryItem | undefined>;
  createInventoryItem(input: InsertInventoryItem): Promise<InventoryItem>;
  updateInventoryItem(id: number, input: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined>;
  deleteInventoryItem(id: number): Promise<boolean>;
  listInventoryMovements(itemId?: number): Promise<InventoryMovement[]>;
  createInventoryMovement(input: InsertInventoryMovement): Promise<InventoryMovement>;

  // attachments
  listAttachments(entityType?: string, entityId?: number): Promise<Attachment[]>;
  createAttachment(input: InsertAttachment): Promise<Attachment>;

  // settings
  listAppSettings(): Promise<AppSetting[]>;
  upsertAppSetting(input: InsertAppSetting): Promise<AppSetting>;
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
    const [row] = await db.update(fleets).set(input).where(eq(fleets.id, id)).returning();
    return row;
  }
  async createFleet(input: InsertFleet): Promise<Fleet> {
    const [fleet] = await db.insert(fleets).values(input).returning();
    await this.seedDefaultFleetRoles(fleet.id);
    for (const fuel of DEFAULT_FUEL_TYPE_ROWS) {
      await db.insert(fleetFuelTypes).values({ fleetId: fleet.id, ...fuel });
    }
    return fleet;
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
  async createSite(input: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(input).returning();
    return site;
  }

  // -- users / memberships ----
  async listUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.displayName);
  }
  async createUser(input: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(input).returning();
    return user;
  }
  async deleteUser(id: number): Promise<boolean> {
    const memberships = await db.select().from(fleetMemberships).where(eq(fleetMemberships.userId, id));
    for (const membership of memberships) {
      if (await isAdminRoleId(membership.roleId)) {
        await assertFleetKeepsAdmin(membership.fleetId, undefined, id);
      }
    }
    await db.delete(fleetMemberships).where(eq(fleetMemberships.userId, id));
    const result = await db.delete(users).where(eq(users.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async listFleetMemberships(): Promise<FleetMembership[]> {
    return db.select().from(fleetMemberships);
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
      return updated;
    }
    const [created] = await db.insert(fleetMemberships).values(input).returning();
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
    return (result.rowCount ?? 0) > 0;
  }
  async listFleetEquipmentTypes(fleetId?: number): Promise<FleetEquipmentType[]> {
    const q = db.select().from(fleetEquipmentTypes).orderBy(fleetEquipmentTypes.name);
    return fleetId ? await q.where(eq(fleetEquipmentTypes.fleetId, fleetId)) : await q;
  }
  async createFleetEquipmentType(input: InsertFleetEquipmentType): Promise<FleetEquipmentType> {
    const [row] = await db.insert(fleetEquipmentTypes).values(input).returning();
    return row;
  }
  async updateFleetEquipmentType(id: number, input: Partial<InsertFleetEquipmentType>): Promise<FleetEquipmentType | undefined> {
    const [row] = await db.update(fleetEquipmentTypes).set(input).where(eq(fleetEquipmentTypes.id, id)).returning();
    return row;
  }
  async deleteFleetEquipmentType(id: number): Promise<boolean> {
    const result = await db.delete(fleetEquipmentTypes).where(eq(fleetEquipmentTypes.id, id));
    return (result.rowCount ?? 0) > 0;
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
  async createFleetFuelType(input: InsertFleetFuelType): Promise<FleetFuelType> {
    const [row] = await db.insert(fleetFuelTypes).values(input).returning();
    return row;
  }
  async updateFleetFuelType(id: number, input: Partial<InsertFleetFuelType>): Promise<FleetFuelType | undefined> {
    const [row] = await db.update(fleetFuelTypes).set(input).where(eq(fleetFuelTypes.id, id)).returning();
    return row;
  }
  async deleteFleetFuelType(id: number): Promise<boolean> {
    const result = await db.delete(fleetFuelTypes).where(eq(fleetFuelTypes.id, id));
    return (result.rowCount ?? 0) > 0;
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
    return row;
  }
  async updateFleetRole(id: number, input: Partial<InsertFleetRole>): Promise<FleetRole | undefined> {
    const [row] = await db.update(fleetRoles).set(input).where(eq(fleetRoles.id, id)).returning();
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
    return (result.rowCount ?? 0) > 0;
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
    const q = db.select().from(inventoryCategories).orderBy(inventoryCategories.name);
    return fleetId ? await q.where(eq(inventoryCategories.fleetId, fleetId)) : await q;
  }
  async createInventoryCategory(input: InsertInventoryCategory): Promise<InventoryCategory> {
    const [row] = await db.insert(inventoryCategories).values(input).returning();
    return row;
  }
  async updateInventoryCategory(id: number, input: Partial<InsertInventoryCategory>): Promise<InventoryCategory | undefined> {
    const [row] = await db.update(inventoryCategories).set(input).where(eq(inventoryCategories.id, id)).returning();
    return row;
  }
  async deleteInventoryCategory(id: number): Promise<boolean> {
    await db.delete(inventoryCategoryFields).where(eq(inventoryCategoryFields.categoryId, id));
    const result = await db.delete(inventoryCategories).where(eq(inventoryCategories.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async listInventoryCategoryFields(categoryId?: number): Promise<InventoryCategoryField[]> {
    const q = db.select().from(inventoryCategoryFields).orderBy(inventoryCategoryFields.sortOrder, inventoryCategoryFields.name);
    return categoryId ? await q.where(eq(inventoryCategoryFields.categoryId, categoryId)) : await q;
  }
  async createInventoryCategoryField(input: InsertInventoryCategoryField): Promise<InventoryCategoryField> {
    const [row] = await db.insert(inventoryCategoryFields).values(input).returning();
    return row;
  }
  async updateInventoryCategoryField(id: number, input: Partial<InsertInventoryCategoryField>): Promise<InventoryCategoryField | undefined> {
    const [row] = await db.update(inventoryCategoryFields).set(input).where(eq(inventoryCategoryFields.id, id)).returning();
    return row;
  }
  async deleteInventoryCategoryField(id: number): Promise<boolean> {
    const result = await db.delete(inventoryCategoryFields).where(eq(inventoryCategoryFields.id, id));
    return (result.rowCount ?? 0) > 0;
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
    return row;
  }
  async updateAsset(id: number, input: Partial<InsertAsset>): Promise<Asset | undefined> {
    const [row] = await db.update(assets).set(input).where(eq(assets.id, id)).returning();
    return row;
  }
  async deleteAsset(id: number): Promise<boolean> {
    const result = await db.delete(assets).where(eq(assets.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // -- meter readings ----
  async listMeterReadings(assetId?: number): Promise<MeterReading[]> {
    const q = db.select().from(meterReadings).orderBy(desc(meterReadings.readingDate));
    return assetId ? await q.where(eq(meterReadings.assetId, assetId)) : await q;
  }
  async getMeterReading(id: number): Promise<MeterReading | undefined> {
    const [row] = await db.select().from(meterReadings).where(eq(meterReadings.id, id));
    return row;
  }
  async updateMeterReading(id: number, input: Partial<InsertMeterReading>): Promise<MeterReading | undefined> {
    const [updated] = await db.update(meterReadings).set(input).where(eq(meterReadings.id, id)).returning();
    if (updated) await this.refreshAssetMeterFromReadings(updated.assetId);
    return updated;
  }
  async deleteMeterReading(id: number): Promise<boolean> {
    const existing = await this.getMeterReading(id);
    const result = await db.delete(meterReadings).where(eq(meterReadings.id, id));
    const removed = (result.rowCount ?? 0) > 0;
    if (removed && existing) await this.refreshAssetMeterFromReadings(existing.assetId);
    return removed;
  }
  private async refreshAssetMeterFromReadings(assetId: number) {
    const asset = await this.getAsset(assetId);
    if (!asset) return;
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
    return row;
  }
  async updateSchedule(id: number, input: Partial<InsertMaintenanceSchedule>): Promise<MaintenanceSchedule | undefined> {
    const [row] = await db.update(maintenanceSchedules).set(input).where(eq(maintenanceSchedules.id, id)).returning();
    return row;
  }
  async deleteSchedule(id: number): Promise<boolean> {
    // Cascade: remove assignments for this schedule.
    await db.delete(maintenanceScheduleAssignments).where(eq(maintenanceScheduleAssignments.scheduleId, id));
    const result = await db.delete(maintenanceSchedules).where(eq(maintenanceSchedules.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async listScheduleAssignments(scheduleId?: number): Promise<MaintenanceScheduleAssignment[]> {
    const q = db.select().from(maintenanceScheduleAssignments);
    return scheduleId ? await q.where(eq(maintenanceScheduleAssignments.scheduleId, scheduleId)) : await q;
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
  async listServiceEvents(assetId?: number): Promise<ServiceEvent[]> {
    const q = db.select().from(serviceEvents).orderBy(desc(serviceEvents.performedAt));
    return assetId ? await q.where(eq(serviceEvents.assetId, assetId)) : await q;
  }
  async getServiceEvent(id: number): Promise<ServiceEvent | undefined> {
    const [row] = await db.select().from(serviceEvents).where(eq(serviceEvents.id, id));
    return row;
  }
  async createServiceEvent(input: InsertServiceEvent): Promise<ServiceEvent> {
    const [event] = await db.insert(serviceEvents).values(input).returning();
    // Auto-create a meter reading when the service captured one.
    if (input.meterAtService != null) {
      const asset = await this.getAsset(input.assetId);
      await this.createMeterReading({
        assetId: input.assetId,
        readingType: asset?.meterType ?? "mileage",
        value: input.meterAtService,
        readingDate: input.performedAt,
        notes: `Recorded with service: ${input.title}`,
        source: "service-event",
      } as InsertMeterReading);
    }
    return event;
  }
  async updateServiceEvent(id: number, input: Partial<InsertServiceEvent>): Promise<ServiceEvent | undefined> {
    const [row] = await db.update(serviceEvents).set(input).where(eq(serviceEvents.id, id)).returning();
    return row;
  }
  async deleteServiceEvent(id: number): Promise<boolean> {
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
    return (result.rowCount ?? 0) > 0;
  }
  async listLineItems(serviceEventId?: number): Promise<ServiceLineItem[]> {
    const q = db.select().from(serviceLineItems);
    return serviceEventId ? await q.where(eq(serviceLineItems.serviceEventId, serviceEventId)) : await q;
  }
  async createLineItem(input: InsertServiceLineItem): Promise<ServiceLineItem> {
    const [line] = await db.insert(serviceLineItems).values(input).returning();
    if (input.inventoryItemId) {
      // Decrement stock and record movement.
      await db.update(inventoryItems)
        .set({ onHand: sql`${inventoryItems.onHand} - ${input.quantity}` })
        .where(eq(inventoryItems.id, input.inventoryItemId));
      const event = await this.getServiceEvent(input.serviceEventId);
      await db.insert(inventoryMovements).values({
        inventoryItemId: input.inventoryItemId,
        movementType: "consumption",
        quantity: -input.quantity,
        serviceEventId: input.serviceEventId,
        occurredAt: event?.performedAt ?? new Date(),
        notes: `Consumed by service event #${input.serviceEventId}`,
      });
    }
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
    return row;
  }
  async updateInventoryItem(id: number, input: Partial<InsertInventoryItem>): Promise<InventoryItem | undefined> {
    const [row] = await db.update(inventoryItems).set(input).where(eq(inventoryItems.id, id)).returning();
    return row;
  }
  async deleteInventoryItem(id: number): Promise<boolean> {
    const result = await db.delete(inventoryItems).where(eq(inventoryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  }
  async listInventoryMovements(itemId?: number): Promise<InventoryMovement[]> {
    const q = db.select().from(inventoryMovements).orderBy(desc(inventoryMovements.occurredAt));
    return itemId ? await q.where(eq(inventoryMovements.inventoryItemId, itemId)) : await q;
  }
  async createInventoryMovement(input: InsertInventoryMovement): Promise<InventoryMovement> {
    const [movement] = await db.insert(inventoryMovements).values(input).returning();
    await db.update(inventoryItems)
      .set({ onHand: sql`${inventoryItems.onHand} + ${input.quantity}` })
      .where(eq(inventoryItems.id, input.inventoryItemId));
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
  async createAttachment(input: InsertAttachment): Promise<Attachment> {
    const [row] = await db.insert(attachments).values(input).returning();
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
      return updated;
    }
    const [created] = await db.insert(appSettings).values(input).returning();
    return created;
  }
}

export const storage = new DatabaseStorage();

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

export async function seedIfEmpty() {
  const existingFleets = await storage.listFleets();
  if (existingFleets.length > 0) return;

  const fleet = await storage.createFleet({
    name: "Sessanna Home Fleet",
    slug: "home",
    currency: "USD",
    notes: "Personal vehicles, trailers, generators, lawn and snow equipment.",
  });

  const homeSite = await storage.createSite({ fleetId: fleet.id, name: "Home Garage", address: "Upstate NY" });

  // Users + memberships (local auth simulation; AD coming later)
  const owner = await storage.createUser({
    username: "jaimy",
    displayName: "Jaimy Sessanna",
    email: "jaimy@sessanna.com",
    passwordHash: null,
    systemAdmin: true,
  });
  const tech = await storage.createUser({
    username: "tech",
    displayName: "Workshop Tech",
    email: null,
    passwordHash: null,
    systemAdmin: false,
  });
  const viewer = await storage.createUser({
    username: "viewer",
    displayName: "Read-only Viewer",
    email: null,
    passwordHash: null,
    systemAdmin: false,
  });
  const seedRoles = await storage.listFleetRoles(fleet.id);
  const seedRoleIdByName = new Map(seedRoles.map(r => [r.name, r.id]));
  await storage.upsertFleetMembership({ fleetId: fleet.id, userId: owner.id, roleId: seedRoleIdByName.get("admin")!, grantedBy: "manual" });
  await storage.upsertFleetMembership({ fleetId: fleet.id, userId: tech.id, roleId: seedRoleIdByName.get("editor")!, grantedBy: "manual" });
  await storage.upsertFleetMembership({ fleetId: fleet.id, userId: viewer.id, roleId: seedRoleIdByName.get("viewer")!, grantedBy: "manual" });
  for (const type of DEFAULT_EQUIPMENT_TYPE_ROWS) {
    await storage.createFleetEquipmentType({ fleetId: fleet.id, active: true, ...type });
  }
  const oilCategory = await storage.createInventoryCategory({ fleetId: fleet.id, name: "oil", description: "Engine oil, hydraulic oil, and other lubricants.", active: true });
  await storage.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Viscosity", fieldType: "text", required: false, sortOrder: 1 });
  await storage.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Container Size", fieldType: "text", required: false, sortOrder: 2 });
  const filterCategory = await storage.createInventoryCategory({ fleetId: fleet.id, name: "filter", description: "Oil, air, fuel, cabin, and hydraulic filters.", active: true });
  await storage.createInventoryCategoryField({ categoryId: filterCategory.id, name: "Filter Type", fieldType: "text", required: false, sortOrder: 1 });
  await storage.createInventoryCategory({ fleetId: fleet.id, name: "fluid", description: "ATF, coolant, brake fluid, gear oil, and additives.", active: true });
  await storage.createInventoryCategory({ fleetId: fleet.id, name: "part", description: "General replacement parts and ad-hoc items.", active: true });

  // ----- Assets ------------------------------------------------------------
  const today = new Date();
  const meterDate = new Date("2025-08-27");

  const silverado = await storage.createAsset({
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

  const tahoe = await storage.createAsset({
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

  const generator = await storage.createAsset({
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

  const trailer = await storage.createAsset({
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
  const oilSchedSilverado = await storage.createSchedule({
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
  await storage.createSchedule({
    assetId: silverado.id, name: "Air Filter", category: "engine",
    readingType: "mileage", meterInterval: 20000, dayInterval: null,
    meterDueSoon: 1500, dayDueSoon: null, notes: "Engine air filter replacement.", active: true,
  });
  await storage.createSchedule({
    assetId: silverado.id, name: "Transmission Service", category: "drivetrain",
    readingType: "mileage", meterInterval: 30000, dayInterval: null,
    meterDueSoon: 2000, dayDueSoon: null, notes: "ATF + filter.", active: true,
  });
  await storage.createSchedule({
    assetId: silverado.id, name: "Coolant Service", category: "engine",
    readingType: "mileage", meterInterval: 100000, dayInterval: 1825,
    meterDueSoon: 5000, dayDueSoon: 60, notes: "Flush and replace coolant on time-based intervals.", active: true,
  });
  await storage.createSchedule({
    assetId: silverado.id, name: "Annual NY Inspection", category: "inspection",
    readingType: "mileage", meterInterval: null, dayInterval: 365,
    meterDueSoon: null, dayDueSoon: 30, notes: "Time-only schedule. Triggered by day interval.", active: true,
  });
  await storage.createSchedule({
    assetId: silverado.id, name: "Battery Terminal Service", category: "other",
    readingType: "mileage", meterInterval: null, dayInterval: 180,
    meterDueSoon: null, dayDueSoon: 21, notes: "Clean and protect battery terminals every 6 months.", active: true,
  });

  // Tahoe — minimal seeded schedules
  await storage.createSchedule({
    assetId: tahoe.id, name: "Oil Change", category: "engine",
    readingType: "mileage", meterInterval: 5000, dayInterval: 365,
    meterDueSoon: 300, dayDueSoon: 30, notes: "5W-30 conventional, AC Delco PF48.", active: true,
  });

  // Generator
  await storage.createSchedule({
    assetId: generator.id, name: "Oil & Filter (Hours)", category: "engine",
    readingType: "hours", meterInterval: 200, dayInterval: 730,
    meterDueSoon: 25, dayDueSoon: 60, notes: "Synthetic 5W-30, replace OEM filter.", active: true,
  });

  // Trailer
  await storage.createSchedule({
    assetId: trailer.id, name: "Annual NY Inspection", category: "inspection",
    readingType: "count", meterInterval: null, dayInterval: 365,
    meterDueSoon: null, dayDueSoon: 30, notes: "Time-only.", active: true,
  });
  await storage.createSchedule({
    assetId: trailer.id, name: "Bearing Re-pack", category: "drivetrain",
    readingType: "count", meterInterval: null, dayInterval: 730,
    meterDueSoon: null, dayDueSoon: 30, notes: "Every 2 years.", active: true,
  });

  // ----- Inventory ---------------------------------------------------------
  const oil5w30 = await storage.createInventoryItem({
    fleetId: fleet.id, name: "Mobil 1 5W-30 Synthetic", category: "oil",
    sku: "M1-5W30-1Q", partNumber: "M1-5W30",
    unit: "qt", onHand: 12, reorderPoint: 6, reorderQuantity: 12,
    lowStockAlert: true, lowStockQuantity: 6, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 8.49, notes: "Engine oil, 1qt bottles.",
  });
  await storage.createInventoryItem({
    fleetId: fleet.id, name: "AC Delco PF48 Oil Filter", category: "filter",
    sku: "ACD-PF48", partNumber: "PF48",
    unit: "each", onHand: 4, reorderPoint: 3, reorderQuantity: 6,
    lowStockAlert: true, lowStockQuantity: 3, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 9.99,
  });
  await storage.createInventoryItem({
    fleetId: fleet.id, name: "K&N Air Filter 33-2129", category: "filter",
    partNumber: "33-2129", unit: "each", onHand: 1, reorderPoint: 1,
    reorderQuantity: 1, stocked: true, unitCost: 64.99,
    lowStockAlert: true, lowStockQuantity: 1, reorderReminder: true, costTracking: true,
  });
  await storage.createInventoryItem({
    fleetId: fleet.id, name: "Dexron VI ATF", category: "fluid",
    unit: "qt", onHand: 5, reorderPoint: 4, reorderQuantity: 12,
    lowStockAlert: true, lowStockQuantity: 4, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 7.49,
  });
  await storage.createInventoryItem({
    fleetId: fleet.id, name: "Bosch ICON 22\" Wiper", category: "wiper",
    unit: "each", onHand: 0, reorderPoint: 1, reorderQuantity: 2,
    lowStockAlert: true, lowStockQuantity: 1, reorderReminder: true,
    costTracking: true, stocked: true, unitCost: 28.99, notes: "Driver side.",
  });
  await storage.createInventoryItem({
    fleetId: fleet.id, name: "DeWalt 12\" Bar Oil 1qt", category: "fluid",
    unit: "qt", onHand: 2, reorderPoint: null, reorderQuantity: null,
    lowStockAlert: false, lowStockQuantity: null, reorderReminder: false,
    costTracking: false, stocked: false, notes: "Ad-hoc, not on routine reorder.",
  });

  // ----- Past service event -- gives Silverado oil-change history ---------
  const sEvent = await storage.createServiceEvent({
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
  await storage.createLineItem({
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

// ---------------------------------------------------------------------------
// Startup: run pending migrations, then seed/backfill.
// ---------------------------------------------------------------------------

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "migrations") });
}

export async function initStorage() {
  await runMigrations();
  await seedIfEmpty();
  await ensureEveryFleetHasAdmin();
}

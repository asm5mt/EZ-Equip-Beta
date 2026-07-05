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
    for (const type of DEFAULT_EQUIPMENT_TYPE_ROWS) {
      await db.insert(fleetEquipmentTypes).values({ fleetId: fleet.id, active: true, ...type });
    }
    const oilCategory = await this.createInventoryCategory({ fleetId: fleet.id, name: "oil", description: "Engine oil, hydraulic oil, and other lubricants.", active: true });
    await this.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Viscosity", fieldType: "text", required: false, sortOrder: 1 });
    await this.createInventoryCategoryField({ categoryId: oilCategory.id, name: "Container Size", fieldType: "text", required: false, sortOrder: 2 });
    const filterCategory = await this.createInventoryCategory({ fleetId: fleet.id, name: "filter", description: "Oil, air, fuel, cabin, and hydraulic filters.", active: true });
    await this.createInventoryCategoryField({ categoryId: filterCategory.id, name: "Filter Type", fieldType: "text", required: false, sortOrder: 1 });
    await this.createInventoryCategory({ fleetId: fleet.id, name: "fluid", description: "ATF, coolant, brake fluid, gear oil, and additives.", active: true });
    await this.createInventoryCategory({ fleetId: fleet.id, name: "part", description: "General replacement parts and ad-hoc items.", active: true });
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
  async getSite(id: number): Promise<Site | undefined> {
    const [row] = await db.select().from(sites).where(eq(sites.id, id));
    return row;
  }
  async createSite(input: InsertSite): Promise<Site> {
    const [site] = await db.insert(sites).values(input).returning();
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
    return user;
  }
  async updateUser(id: number, input: Partial<InsertUser>): Promise<User | undefined> {
    const [row] = await db.update(users).set(input).where(eq(users.id, id)).returning();
    return row;
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
  async getFleetEquipmentType(id: number): Promise<FleetEquipmentType | undefined> {
    const [row] = await db.select().from(fleetEquipmentTypes).where(eq(fleetEquipmentTypes.id, id));
    return row;
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
  async getFleetFuelType(id: number): Promise<FleetFuelType | undefined> {
    const [row] = await db.select().from(fleetFuelTypes).where(eq(fleetFuelTypes.id, id));
    return row;
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
  async getInventoryCategory(id: number): Promise<InventoryCategory | undefined> {
    const [row] = await db.select().from(inventoryCategories).where(eq(inventoryCategories.id, id));
    return row;
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
  async getInventoryMovement(id: number): Promise<InventoryMovement | undefined> {
    const [row] = await db.select().from(inventoryMovements).where(eq(inventoryMovements.id, id));
    return row;
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
// Startup: run pending migrations, then backfill.
// ---------------------------------------------------------------------------

export async function runMigrations() {
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "migrations") });
}

export async function initStorage() {
  await runMigrations();
  await ensureEveryFleetHasAdmin();
}

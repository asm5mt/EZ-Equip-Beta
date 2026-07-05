import type { Request, Response, NextFunction } from "express";
import { storage } from "./storage";
import type { PermissionKey } from "@shared/permissions";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "not_authenticated" });
  next();
}

export function requireSystemAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "not_authenticated" });
  if (!req.user.systemAdmin) return res.status(403).json({ error: "forbidden" });
  next();
}

type FleetIdResolver = (req: Request) => Promise<number | undefined>;

// Fleet-membership gate (read enforcement): the caller must belong to the
// resolved fleet, or be systemAdmin. Resolution happens before the
// systemAdmin short-circuit so a nonexistent resource still 404s for admins.
export function requireFleetMember(resolveFleetId: FleetIdResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "not_authenticated" });
    const fleetId = await resolveFleetId(req);
    if (fleetId == null) return res.status(404).json({ error: "not_found" });
    req.resolvedFleetId = fleetId;
    if (req.user.systemAdmin) return next();
    const memberships = await storage.listFleetMemberships();
    const isMember = memberships.some(m => m.userId === req.user!.id && m.fleetId === fleetId);
    if (!isMember) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// Permission-key gate (write enforcement): implies fleet membership, plus
// the caller's role for that fleet must include the given permission key.
export function requirePermission(key: PermissionKey, resolveFleetId: FleetIdResolver) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "not_authenticated" });
    const fleetId = await resolveFleetId(req);
    if (fleetId == null) return res.status(404).json({ error: "not_found" });
    req.resolvedFleetId = fleetId;
    if (req.user.systemAdmin) return next();
    const memberships = await storage.listFleetMemberships();
    const membership = memberships.find(m => m.userId === req.user!.id && m.fleetId === fleetId);
    if (!membership) return res.status(403).json({ error: "forbidden" });
    const roles = await storage.listFleetRolesWithPermissions(fleetId);
    const role = roles.find(r => r.id === membership.roleId);
    if (!role || !role.permissions.includes(key)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}

// ---------------------------------------------------------------------------
// Resolver helpers, grouped by pattern.
// ---------------------------------------------------------------------------

// Pattern A: fleetId is already present on the request (query or body).
export const fleetIdFromQuery: FleetIdResolver = async (req) => {
  const raw = req.query.fleetId ?? req.body?.fleetId;
  return raw != null ? Number(raw) : undefined;
};

// Pattern A: fleetId must be looked up via the resource's own row.
export const fleetIdFromAsset: FleetIdResolver = async (req) => {
  const asset = await storage.getAsset(Number(req.params.id));
  return asset?.fleetId;
};
export const fleetIdFromInventoryItem: FleetIdResolver = async (req) => {
  const item = await storage.getInventoryItem(Number(req.params.id));
  return item?.fleetId;
};
export const fleetIdFromInventoryCategory: FleetIdResolver = async (req) => {
  const category = await storage.getInventoryCategory(Number(req.params.id));
  return category?.fleetId;
};
export const fleetIdFromFleetEquipmentType: FleetIdResolver = async (req) => {
  const row = await storage.getFleetEquipmentType(Number(req.params.id));
  return row?.fleetId;
};
export const fleetIdFromFleetFuelType: FleetIdResolver = async (req) => {
  const row = await storage.getFleetFuelType(Number(req.params.id));
  return row?.fleetId;
};
export const fleetIdFromFleetRole: FleetIdResolver = async (req) => {
  const role = await storage.getFleetRole(Number(req.params.id));
  return role?.fleetId;
};
export const fleetIdFromSite: FleetIdResolver = async (req) => {
  const site = await storage.getSite(Number(req.params.id));
  return site?.fleetId;
};
export const fleetIdFromFleet: FleetIdResolver = async (req) => {
  const fleet = await storage.getFleet(Number(req.params.id));
  return fleet?.id;
};

// Schedules: fleetId is nullable for asset-scoped rows -- walk up to the asset.
async function fleetIdFromScheduleId(scheduleId: number): Promise<number | undefined> {
  const schedule = await storage.getSchedule(scheduleId);
  if (!schedule) return undefined;
  if (schedule.fleetId != null) return schedule.fleetId;
  if (schedule.assetId != null) return (await storage.getAsset(schedule.assetId))?.fleetId;
  return undefined;
}
export const fleetIdFromSchedule: FleetIdResolver = async (req) => fleetIdFromScheduleId(Number(req.params.id));

// Pattern B: child resource, walk up through the parent.
export const fleetIdFromMeterReading: FleetIdResolver = async (req) => {
  const reading = await storage.getMeterReading(Number(req.params.id));
  if (!reading) return undefined;
  return (await storage.getAsset(reading.assetId))?.fleetId;
};
export const fleetIdFromMeterReadingsQuery: FleetIdResolver = async (req) => {
  if (req.query.fleetId != null) return Number(req.query.fleetId);
  const assetId = req.query.assetId != null ? Number(req.query.assetId) : undefined;
  if (assetId == null) return undefined;
  return (await storage.getAsset(assetId))?.fleetId;
};
export const fleetIdFromServiceEvent: FleetIdResolver = async (req) => {
  const event = await storage.getServiceEvent(Number(req.params.id));
  if (!event) return undefined;
  return (await storage.getAsset(event.assetId))?.fleetId;
};
export const fleetIdFromServiceEventsQuery: FleetIdResolver = async (req) => {
  if (req.query.fleetId != null) return Number(req.query.fleetId);
  const assetId = req.query.assetId != null ? Number(req.query.assetId) : undefined;
  if (assetId == null) return undefined;
  return (await storage.getAsset(assetId))?.fleetId;
};
export const fleetIdFromLineItem: FleetIdResolver = async (req) => {
  const line = await storage.getLineItem(Number(req.params.id));
  if (!line) return undefined;
  const event = await storage.getServiceEvent(line.serviceEventId);
  if (!event) return undefined;
  return (await storage.getAsset(event.assetId))?.fleetId;
};
export const fleetIdFromServiceEventBody: FleetIdResolver = async (req) => {
  const serviceEventId = Number(req.body?.serviceEventId ?? req.params.id);
  const event = await storage.getServiceEvent(serviceEventId);
  if (!event) return undefined;
  return (await storage.getAsset(event.assetId))?.fleetId;
};
export const fleetIdFromInventoryMovement: FleetIdResolver = async (req) => {
  const itemId = Number(req.body?.inventoryItemId ?? req.query.itemId);
  const item = await storage.getInventoryItem(itemId);
  return item?.fleetId;
};
export const fleetIdFromInventoryCategoryField: FleetIdResolver = async (req) => {
  const field = await storage.getInventoryCategoryField(Number(req.params.id));
  if (!field) return undefined;
  const category = await storage.getInventoryCategory(field.categoryId);
  return category?.fleetId;
};
export const fleetIdFromScheduleAssignments: FleetIdResolver = async (req) => fleetIdFromScheduleId(Number(req.params.id));
export const fleetIdFromScheduleAssignmentsQuery: FleetIdResolver = async (req) => {
  if (req.query.fleetId != null) return Number(req.query.fleetId);
  const scheduleId = req.query.scheduleId != null ? Number(req.query.scheduleId) : undefined;
  return scheduleId != null ? fleetIdFromScheduleId(scheduleId) : undefined;
};
export const fleetIdFromAssetBody: FleetIdResolver = async (req) => {
  const assetId = req.body?.assetId != null ? Number(req.body.assetId) : undefined;
  if (assetId == null) return undefined;
  return (await storage.getAsset(assetId))?.fleetId;
};

// Pattern C: attachments are polymorphic on entityType/entityId.
export const fleetIdFromAttachment: FleetIdResolver = async (req) => {
  const entityType = String(req.query.entityType ?? req.body?.entityType ?? "");
  const entityId = Number(req.query.entityId ?? req.body?.entityId);
  if (!entityId) return undefined;
  switch (entityType) {
    case "inventory-item": {
      const item = await storage.getInventoryItem(entityId);
      return item?.fleetId;
    }
    case "service-event": {
      const event = await storage.getServiceEvent(entityId);
      if (!event) return undefined;
      return (await storage.getAsset(event.assetId))?.fleetId;
    }
    case "inventory-movement": {
      const movement = await storage.getInventoryMovement(entityId);
      if (!movement) return undefined;
      const item = await storage.getInventoryItem(movement.inventoryItemId);
      return item?.fleetId;
    }
    default:
      return undefined;
  }
};

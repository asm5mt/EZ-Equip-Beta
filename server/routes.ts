import type { Express, Request } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import argon2 from "argon2";
import { storage } from "./storage";
import { registerAuthRoutes } from "./auth";
import { registerOidcRoutes, testOidcConnection } from "./oidc";
import { geocodeAddress } from "./geocode";
import { composeAddress } from "@shared/address";
import {
  requireAuth,
  requireSystemAdmin,
  requireFleetMember,
  requirePermission,
  fleetIdFromQuery,
  fleetIdFromAsset,
  fleetIdFromInventoryItem,
  fleetIdFromInventoryCategory,
  fleetIdFromFleetEquipmentType,
  fleetIdFromFleetFuelType,
  fleetIdFromFleetRole,
  fleetIdFromSite,
  fleetIdFromFleet,
  fleetIdFromSchedule,
  fleetIdFromMeterReading,
  fleetIdFromMeterReadingsQuery,
  fleetIdFromServiceEvent,
  fleetIdFromServiceEventsQuery,
  fleetIdFromLineItem,
  fleetIdFromServiceEventBody,
  fleetIdFromInventoryMovement,
  fleetIdFromInventoryCategoryField,
  fleetIdFromScheduleAssignments,
  fleetIdFromScheduleAssignmentsQuery,
  fleetIdFromAssetBody,
  fleetIdFromAttachment,
} from "./permissions-middleware";
import {
  insertFleetSchema,
  insertSiteSchema,
  insertUserSchema,
  insertFleetMembershipSchema,
  insertFleetEquipmentTypeSchema,
  insertFleetFuelTypeSchema,
  insertServiceFacilitySchema,
  insertServiceFacilityTypeSchema,
  insertFleetRoleSchema,
  insertInventoryCategorySchema,
  insertInventoryCategoryFieldSchema,
  insertAssetSchema,
  insertMeterReadingSchema,
  insertMaintenanceScheduleSchema,
  insertServiceEventSchema,
  insertServiceLineItemSchema,
  insertInventoryItemSchema,
  insertInventoryMovementSchema,
  insertAttachmentSchema,
  insertAppSettingSchema,
  insertOidcGroupMappingSchema,
} from "@shared/schema";
import type { InsertSystemSettings } from "@shared/schema";
import { PERMISSION_CATALOG } from "@shared/permissions";
import type { PermissionKey } from "@shared/permissions";
import { z } from "zod";

type HistoryKind = "service" | "meter";
type HistoryFormat = "csv" | "xls" | "pdf";
type HistoryTable = {
  title: string;
  filenameBase: string;
  asset: NonNullable<Awaited<ReturnType<typeof storage.getAsset>>>;
  columns: string[];
  rows: (string | number)[][];
};

function formatDate(value: unknown) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value: unknown) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

function meterUnitLabel(type?: string | null, customLabel?: string | null) {
  if (type === "hours") return "hr";
  if (type === "count") return customLabel || "count";
  if (type === "custom") return customLabel || "units";
  return "mi";
}

function meterFullLabel(type?: string | null, customLabel?: string | null) {
  if (type === "hours") return "Hours";
  if (type === "count") return customLabel || "Count";
  if (type === "custom") return customLabel || "Reading";
  return "Mileage";
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9-_]+/gi, "_").replace(/^_+|_+$/g, "") || "asset";
}

function csvEscape(value: string | number) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function htmlEscape(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function contentDisposition(filename: string) {
  return `attachment; filename="${filename.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

function assetMetaLines(asset: HistoryTable["asset"]) {
  const vehicle = [asset.year, asset.make, asset.model, asset.trim].filter(Boolean).join(" ");
  return [
    `Asset: ${asset.friendlyName}`,
    vehicle ? `Vehicle: ${vehicle}` : "",
    asset.vin ? `VIN: ${asset.vin}` : "",
    asset.serial ? `Serial: ${asset.serial}` : "",
    asset.engine ? `Engine: ${asset.engine}` : "",
    `Current ${meterFullLabel(asset.meterType, asset.meterLabel)}: ${formatNumber(asset.currentMeter)} ${meterUnitLabel(asset.meterType, asset.meterLabel)} (as of ${formatDate(asset.meterAsOf)})`,
  ].filter(Boolean);
}

async function buildHistoryTable(assetId: number, kind: HistoryKind): Promise<HistoryTable | undefined> {
  const asset = await storage.getAsset(assetId);
  if (!asset) return undefined;
  const meterUnit = meterUnitLabel(asset.meterType, asset.meterLabel);
  const filenameBase = safeFilename(`${asset.friendlyName}_${kind === "service" ? "Service_History" : "Meter_History"}`);

  if (kind === "service") {
    const events = (await storage.listServiceEvents(assetId)).sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
    const allLines = await storage.listLineItems();
    const linesByEvent = new Map<number, typeof allLines>();
    for (const line of allLines) {
      if (!linesByEvent.has(line.serviceEventId)) linesByEvent.set(line.serviceEventId, []);
      linesByEvent.get(line.serviceEventId)!.push(line);
    }
    return {
      title: "Service History",
      filenameBase,
      asset,
      columns: ["Date", `Meter (${meterUnit})`, "Service", "Oil / Fluid", "Filter / Part", "Notes"],
      rows: events.map((event) => {
        const eventLines = linesByEvent.get(event.id) ?? [];
        const fluids = eventLines
          .filter((line) => /oil|fluid|atf|coolant/i.test(`${line.itemName} ${line.spec ?? ""}`))
          .map((line) => `${line.itemName} (${formatNumber(line.quantity)} ${line.unit ?? ""})`);
        const parts = eventLines
          .filter((line) => !/oil|fluid|atf|coolant/i.test(line.itemName))
          .map((line) => (line.partNumber ? `${line.itemName} ${line.partNumber}` : line.itemName));
        return [
          formatDate(event.performedAt),
          event.meterAtService != null ? formatNumber(event.meterAtService) : "",
          event.title,
          fluids.join("; "),
          parts.join("; "),
          event.notes ?? "",
        ];
      }),
    };
  }

  const readings = (await storage.listMeterReadings(assetId)).sort((a, b) => new Date(b.readingDate).getTime() - new Date(a.readingDate).getTime());
  return {
    title: "Meter History",
    filenameBase,
    asset,
    columns: ["Date", `${meterFullLabel(asset.meterType, asset.meterLabel)} (${meterUnit})`, "Source", "Notes"],
    rows: readings.map((reading) => [
      formatDate(reading.readingDate),
      reading.value != null ? formatNumber(reading.value) : "",
      reading.source ?? "",
      reading.notes ?? "",
    ]),
  };
}

function tableToCsv(table: HistoryTable) {
  return [
    `# ${table.title}`,
    ...assetMetaLines(table.asset).map((line) => `# ${line}`),
    `# Exported: ${new Date().toISOString()}`,
    table.columns.map(csvEscape).join(","),
    ...table.rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");
}

function tableToXlsHtml(table: HistoryTable) {
  const metaRows = [
    [table.title],
    ...assetMetaLines(table.asset).map((line) => [line]),
    [`Exported: ${new Date().toLocaleString("en-US")}`],
    [],
  ];
  const rows = [...metaRows, table.columns, ...table.rows];
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
    td, th { border: 1px solid #d9d9d9; padding: 4px 6px; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; }
    .title td { font-size: 14pt; font-weight: 700; border: none; }
    .meta td { border: none; color: #444; }
    .blank td { border: none; height: 10px; }
  </style>
</head>
<body>
  <table>
    ${rows.map((row, idx) => {
      const cls = idx === 0 ? "title" : idx < metaRows.length - 1 ? "meta" : row.length === 0 ? "blank" : "";
      const tag = idx === metaRows.length ? "th" : "td";
      const cells = (row.length ? row : [""]).map((cell) => `<${tag}>${htmlEscape(cell)}</${tag}>`).join("");
      return `<tr class="${cls}">${cells}</tr>`;
    }).join("")}
  </table>
</body>
</html>`;
}

function tableToPdfBuffer(table: HistoryTable) {
  const doc = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const margin = 36;
  let y = margin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(table.asset.friendlyName, margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(table.title.toUpperCase(), margin, y);
  y += 14;
  doc.setTextColor(40);
  for (const line of assetMetaLines(table.asset)) {
    doc.text(line, margin, y);
    y += 13;
  }
  y += 8;
  autoTable(doc, {
    startY: y,
    head: [table.columns],
    body: table.rows.map((row) => row.map((cell) => String(cell ?? ""))),
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [247, 246, 242], textColor: [40, 37, 29], lineColor: [212, 209, 202] },
    alternateRowStyles: { fillColor: [251, 251, 249] },
    margin: { left: margin, right: margin },
    tableLineColor: [236, 234, 227],
    tableLineWidth: 0.5,
  });
  return Buffer.from(doc.output("arraybuffer"));
}

function tableToPrintableHtml(table: HistoryTable) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(table.asset.friendlyName)} - ${htmlEscape(table.title)}</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: Arial, sans-serif; color: #222; margin: 24px; }
    .toolbar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 16px; }
    button { border: 1px solid #bbb; background: #fff; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .kicker { color: #666; font-size: 12px; letter-spacing: .14em; text-transform: uppercase; margin-bottom: 12px; }
    .meta { color: #444; font-size: 13px; line-height: 1.45; margin-bottom: 18px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #ddd; padding: 6px 8px; vertical-align: top; text-align: left; }
    th { background: #f4f4f4; }
    tr:nth-child(even) td { background: #fafafa; }
    @media print {
      body { margin: 0.35in; }
      .toolbar { display: none !important; }
      table { font-size: 10px; }
    }
  </style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>
  <h1>${htmlEscape(table.asset.friendlyName)}</h1>
  <div class="kicker">${htmlEscape(table.title)}</div>
  <div class="meta">${assetMetaLines(table.asset).map(htmlEscape).join("<br>")}</div>
  <table>
    <thead><tr>${table.columns.map((col) => `<th>${htmlEscape(col)}</th>`).join("")}</tr></thead>
    <tbody>
      ${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${htmlEscape(cell)}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>
</body>
</html>`;
}

function handleError(res: any, err: any) {
  if (err instanceof z.ZodError) {
    return res.status(400).json({ error: "validation_error", issues: err.issues });
  }
  if (String(err?.message ?? err).includes("cannot_remove_last_fleet_admin")) {
    return res.status(409).json({
      error: "cannot_remove_last_fleet_admin",
      message: "Each fleet must always have at least one Admin.",
    });
  }
  console.error(err);
  return res.status(500).json({ error: "internal_error", message: String(err?.message ?? err) });
}

function nhtsaModelCandidates(model: string) {
  const candidates = [
    model,
    model.replace(/\s+\d{3,4}\s*(HD|LD|XD)?$/i, "").trim(),
    model.replace(/\s+(HD|LD|XD)$/i, "").trim(),
  ].filter(Boolean);
  return Array.from(new Set(candidates));
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  registerAuthRoutes(app);
  registerOidcRoutes(app);

  app.get("/api/nhtsa/safety", async (req, res) => {
    const make = String(req.query.make ?? "").trim();
    const model = String(req.query.model ?? "").trim();
    const modelYear = String(req.query.modelYear ?? req.query.year ?? "").trim();
    const exactModel = String(req.query.exactModel ?? "").toLowerCase() === "true";
    if (!make || !model || !modelYear) {
      return res.status(400).json({ error: "missing_vehicle_details" });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      let lastStatuses: { recallsStatus?: number; complaintsStatus?: number; model?: string } = {};
      for (const lookupModel of exactModel ? [model] : nhtsaModelCandidates(model)) {
        const params = new URLSearchParams({ make, model: lookupModel, modelYear });
        const [recallsResponse, complaintsResponse] = await Promise.all([
          fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }),
          fetch(`https://api.nhtsa.gov/complaints/complaintsByVehicle?${params.toString()}`, {
            headers: { Accept: "application/json" },
            signal: controller.signal,
          }),
        ]);
        lastStatuses = {
          recallsStatus: recallsResponse.status,
          complaintsStatus: complaintsResponse.status,
          model: lookupModel,
        };
        if (!recallsResponse.ok || !complaintsResponse.ok) {
          continue;
        }
        const [recallsData, complaintsData] = await Promise.all([
          recallsResponse.json(),
          complaintsResponse.json(),
        ]);
        const recalls = Array.isArray(recallsData?.Results)
          ? recallsData.Results
          : Array.isArray(recallsData?.results)
            ? recallsData.results
            : [];
        const complaints = Array.isArray(complaintsData?.Results)
          ? complaintsData.Results
          : Array.isArray(complaintsData?.results)
            ? complaintsData.results
            : [];
        return res.json({
          make,
          model,
          lookupModel,
          modelYear,
          recalls,
          complaints,
          recallCount: recalls.length,
          complaintCount: complaints.length,
        });
      }
      return res.status(502).json({
        error: "nhtsa_error",
        ...lastStatuses,
      });
    } catch (err) {
      res.status(504).json({ error: "nhtsa_unavailable", message: String((err as Error)?.message ?? err) });
    } finally {
      clearTimeout(timeout);
    }
  });

  app.get("/api/nhtsa/recalls", async (req, res) => {
    const make = String(req.query.make ?? "").trim();
    const model = String(req.query.model ?? "").trim();
    const modelYear = String(req.query.modelYear ?? req.query.year ?? "").trim();
    if (!make || !model || !modelYear) {
      return res.status(400).json({ error: "missing_vehicle_details" });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const params = new URLSearchParams({ make, model, modelYear });
      const response = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        return res.status(502).json({ error: "nhtsa_error", status: response.status });
      }
      const data = await response.json();
      const count = Number(data?.Count ?? data?.count ?? data?.Results?.length ?? data?.results?.length ?? 0);
      res.json({ count: Number.isFinite(count) ? count : 0, make, model, modelYear });
    } catch (err) {
      res.status(504).json({ error: "nhtsa_unavailable", message: String((err as Error)?.message ?? err) });
    } finally {
      clearTimeout(timeout);
    }
  });

  // ---------- Fleets ----------
  app.get("/api/fleets", requireAuth, async (req, res) => {
    const all = await storage.listFleets();
    if (req.user!.systemAdmin) return res.json(all);
    const myFleetIds = new Set((await storage.listFleetMemberships()).filter(m => m.userId === req.user!.id).map(m => m.fleetId));
    res.json(all.filter(f => myFleetIds.has(f.id)));
  });
  app.post("/api/fleets", requireSystemAdmin, async (req, res) => {
    try {
      const data = insertFleetSchema.parse(req.body);
      res.json(await storage.createFleet(data));
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleets/:id", requirePermission("fleets.manage_settings", fleetIdFromFleet), async (req, res) => {
    try {
      const patch = insertFleetSchema.partial().parse(req.body);
      const addressFieldsChanged = (["addressLine", "addressLine2", "city", "state", "zip", "country"] as const).some(key => key in patch);
      let geo: { latitude?: number | null; longitude?: number | null } = {};
      if (addressFieldsChanged) {
        const existing = await storage.getFleet(Number(req.params.id));
        geo = await geocodeAddress(composeAddress({ ...existing, ...patch }));
      }
      const updated = await storage.updateFleet(Number(req.params.id), { ...patch, ...geo });
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleets/:id", requireSystemAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteFleet(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });

  app.get("/api/fleets/:id/sites", requireFleetMember(fleetIdFromFleet), async (req, res) => {
    res.json(await storage.listSites(Number(req.params.id)));
  });
  app.post("/api/sites", requirePermission("fleets.manage_settings", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.createSite(insertSiteSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });

  // ---------- Users / memberships ----------
  app.get("/api/users", requireAuth, async (_req, res) => res.json(await storage.listUsers()));
  app.post("/api/users", requireSystemAdmin, async (req, res) => {
    try { res.json(await storage.createUser(insertUserSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.delete("/api/users/:id", requireSystemAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteUser(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/users/:id/password", requireSystemAdmin, async (req, res) => {
    try {
      const body = z.object({ password: z.string().min(8) }).parse(req.body);
      const passwordHash = await argon2.hash(body.password);
      const updated = await storage.updateUser(Number(req.params.id), { passwordHash });
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/fleet-memberships", requireAuth, async (_req, res) => res.json(await storage.listFleetMemberships()));
  app.post("/api/fleet-memberships", requirePermission("users.manage", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.upsertFleetMembership(insertFleetMembershipSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-memberships", requirePermission("users.manage", fleetIdFromQuery), async (req, res) => {
    try {
      const fleetId = Number(req.query.fleetId);
      const userId = Number(req.query.userId);
      const ok = await storage.deleteFleetMembership(fleetId, userId);
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/fleet-equipment-types", requireFleetMember(fleetIdFromQuery), async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listFleetEquipmentTypes(fleetId));
  });
  app.post("/api/fleet-equipment-types", requirePermission("fleets.manage_settings", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.createFleetEquipmentType(insertFleetEquipmentTypeSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleet-equipment-types/:id", requirePermission("fleets.manage_settings", fleetIdFromFleetEquipmentType), async (req, res) => {
    try {
      const updated = await storage.updateFleetEquipmentType(Number(req.params.id), insertFleetEquipmentTypeSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-equipment-types/:id", requirePermission("fleets.manage_settings", fleetIdFromFleetEquipmentType), async (req, res) => {
    try {
      const ok = await storage.deleteFleetEquipmentType(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/fleet-fuel-types", requireFleetMember(fleetIdFromQuery), async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listFleetFuelTypes(fleetId));
  });
  app.post("/api/fleet-fuel-types", requirePermission("fleets.manage_settings", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.createFleetFuelType(insertFleetFuelTypeSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleet-fuel-types/:id", requirePermission("fleets.manage_settings", fleetIdFromFleetFuelType), async (req, res) => {
    try {
      const updated = await storage.updateFleetFuelType(Number(req.params.id), insertFleetFuelTypeSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-fuel-types/:id", requirePermission("fleets.manage_settings", fleetIdFromFleetFuelType), async (req, res) => {
    try {
      const ok = await storage.deleteFleetFuelType(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  // Instance-wide: not scoped to any single fleet, so membership can't gate
  // access — any authenticated user can view, only a system admin can write.
  app.get("/api/service-facilities", requireAuth, async (_req, res) => {
    res.json(await storage.listServiceFacilities());
  });
  app.post("/api/service-facilities", requireSystemAdmin, async (req, res) => {
    try {
      const parsed = insertServiceFacilitySchema.parse(req.body);
      const geo = await geocodeAddress(composeAddress(parsed));
      res.json(await storage.createServiceFacility({ ...parsed, ...geo }));
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/service-facilities/:id", requireSystemAdmin, async (req, res) => {
    try {
      const patch = insertServiceFacilitySchema.partial().parse(req.body);
      const addressFieldsChanged = (["addressLine", "addressLine2", "city", "state", "zip", "country"] as const).some(key => key in patch);
      let geo: { latitude?: number | null; longitude?: number | null } = {};
      if (addressFieldsChanged) {
        const existing = await storage.getServiceFacility(Number(req.params.id));
        geo = await geocodeAddress(composeAddress({ ...existing, ...patch }));
      }
      const updated = await storage.updateServiceFacility(Number(req.params.id), { ...patch, ...geo });
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/service-facilities/:id", requireSystemAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteServiceFacility(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/service-facility-types", requireAuth, async (_req, res) => {
    res.json(await storage.listServiceFacilityTypes());
  });
  app.post("/api/service-facility-types", requireSystemAdmin, async (req, res) => {
    try { res.json(await storage.createServiceFacilityType(insertServiceFacilityTypeSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/service-facility-types/:id", requireSystemAdmin, async (req, res) => {
    try {
      const updated = await storage.updateServiceFacilityType(Number(req.params.id), insertServiceFacilityTypeSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/service-facility-types/:id", requireSystemAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteServiceFacilityType(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/permissions", requireAuth, async (_req, res) => res.json(PERMISSION_CATALOG));
  app.get("/api/fleet-roles", requireAuth, async (req, res) => {
    const fleetIdParam = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    const myFleetIds = req.user!.systemAdmin
      ? null
      : new Set((await storage.listFleetMemberships()).filter(m => m.userId === req.user!.id).map(m => m.fleetId));
    if (fleetIdParam != null) {
      if (myFleetIds && !myFleetIds.has(fleetIdParam)) return res.status(403).json({ error: "forbidden" });
      return res.json(await storage.listFleetRolesWithPermissions(fleetIdParam));
    }
    const all = await storage.listFleetRolesWithPermissions();
    res.json(myFleetIds ? all.filter(r => myFleetIds.has(r.fleetId)) : all);
  });
  app.post("/api/fleet-roles", requirePermission("roles.manage", fleetIdFromQuery), async (req, res) => {
    try {
      const body = insertFleetRoleSchema.extend({ permissions: z.array(z.string()).optional() }).parse(req.body);
      const { permissions, ...roleInput } = body;
      const role = await storage.createFleetRole(roleInput);
      if (permissions) await storage.setFleetRolePermissions(role.id, permissions);
      res.json({ ...role, permissions: permissions ?? [] });
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleet-roles/:id", requirePermission("roles.manage", fleetIdFromFleetRole), async (req, res) => {
    try {
      const body = insertFleetRoleSchema.partial().extend({ permissions: z.array(z.string()).optional() }).parse(req.body);
      const { permissions, ...roleInput } = body;
      const id = Number(req.params.id);
      const updated = Object.keys(roleInput).length > 0
        ? await storage.updateFleetRole(id, roleInput)
        : await storage.getFleetRole(id);
      if (!updated) return res.status(404).json({ error: "not_found" });
      if (permissions) await storage.setFleetRolePermissions(updated.id, permissions);
      res.json(permissions ? { ...updated, permissions } : updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-roles/:id", requirePermission("roles.manage", fleetIdFromFleetRole), async (req, res) => {
    try {
      const ok = await storage.deleteFleetRole(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });

  app.get("/api/inventory-categories", requireFleetMember(fleetIdFromQuery), async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listInventoryCategories(fleetId));
  });
  app.post("/api/inventory-categories", requirePermission("fleets.manage_settings", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.createInventoryCategory(insertInventoryCategorySchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/inventory-categories/:id", requirePermission("fleets.manage_settings", fleetIdFromInventoryCategory), async (req, res) => {
    try {
      const updated = await storage.updateInventoryCategory(Number(req.params.id), insertInventoryCategorySchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/inventory-categories/:id", requirePermission("fleets.manage_settings", fleetIdFromInventoryCategory), async (req, res) => {
    try {
      const ok = await storage.deleteInventoryCategory(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  const fleetIdFromCategoryQuery = async (req: Request) => {
    if (req.query.fleetId != null) return Number(req.query.fleetId);
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    if (categoryId == null) return undefined;
    return (await storage.getInventoryCategory(categoryId))?.fleetId;
  };
  const fleetIdFromCategoryBody = async (req: Request) => {
    const categoryId = req.body?.categoryId != null ? Number(req.body.categoryId) : undefined;
    if (categoryId == null) return undefined;
    return (await storage.getInventoryCategory(categoryId))?.fleetId;
  };
  app.get("/api/inventory-category-fields", requireFleetMember(fleetIdFromCategoryQuery), async (req, res) => {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listInventoryCategoryFields(categoryId, fleetId));
  });
  app.post("/api/inventory-category-fields", requirePermission("fleets.manage_settings", fleetIdFromCategoryBody), async (req, res) => {
    try { res.json(await storage.createInventoryCategoryField(insertInventoryCategoryFieldSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/inventory-category-fields/:id", requirePermission("fleets.manage_settings", fleetIdFromInventoryCategoryField), async (req, res) => {
    try {
      const updated = await storage.updateInventoryCategoryField(Number(req.params.id), insertInventoryCategoryFieldSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/inventory-category-fields/:id", requirePermission("fleets.manage_settings", fleetIdFromInventoryCategoryField), async (req, res) => {
    try {
      const ok = await storage.deleteInventoryCategoryField(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });

  // ---------- Assets ----------
  app.get("/api/assets", requireFleetMember(fleetIdFromQuery), async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listAssets(fleetId));
  });
  app.get("/api/assets/:id", requireFleetMember(fleetIdFromAsset), async (req, res) => {
    const a = await storage.getAsset(Number(req.params.id));
    if (!a) return res.status(404).json({ error: "not_found" });
    res.json(a);
  });
  app.post("/api/assets", requirePermission("assets.edit", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.createAsset(insertAssetSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/assets/:id", requirePermission("assets.edit", fleetIdFromAsset), async (req, res) => {
    try {
      const partial = insertAssetSchema.partial().parse(req.body);
      const updated = await storage.updateAsset(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/assets/:id", requirePermission("assets.delete", fleetIdFromAsset), async (req, res) => {
    const ok = await storage.deleteAsset(Number(req.params.id));
    res.json({ ok });
  });

  app.get("/api/assets/:id/history/:kind/export/:format", requireFleetMember(fleetIdFromAsset), async (req, res) => {
    try {
      const kind = String(req.params.kind) as HistoryKind;
      const format = String(req.params.format) as HistoryFormat;
      if (kind !== "service" && kind !== "meter") return res.status(404).json({ error: "not_found" });
      if (format !== "csv" && format !== "xls" && format !== "pdf") return res.status(404).json({ error: "not_found" });
      const table = await buildHistoryTable(Number(req.params.id), kind);
      if (!table) return res.status(404).json({ error: "not_found" });

      if (format === "csv") {
        const filename = `${table.filenameBase}.csv`;
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", contentDisposition(filename));
        return res.send(tableToCsv(table));
      }

      if (format === "xls") {
        const filename = `${table.filenameBase}.xls`;
        res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
        res.setHeader("Content-Disposition", contentDisposition(filename));
        return res.send(tableToXlsHtml(table));
      }

      const filename = `${table.filenameBase}.pdf`;
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", contentDisposition(filename));
      return res.send(tableToPdfBuffer(table));
    } catch (err) {
      return handleError(res, err);
    }
  });

  app.get("/api/assets/:id/history/:kind/print", requireFleetMember(fleetIdFromAsset), async (req, res) => {
    try {
      const kind = String(req.params.kind) as HistoryKind;
      if (kind !== "service" && kind !== "meter") return res.status(404).json({ error: "not_found" });
      const table = await buildHistoryTable(Number(req.params.id), kind);
      if (!table) return res.status(404).json({ error: "not_found" });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.send(tableToPrintableHtml(table));
    } catch (err) {
      return handleError(res, err);
    }
  });

  // ---------- Meter readings ----------
  app.get("/api/meter-readings", requireFleetMember(fleetIdFromMeterReadingsQuery), async (req, res) => {
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listMeterReadings(assetId, fleetId));
  });
  app.post("/api/meter-readings", requirePermission("meters.log", fleetIdFromAssetBody), async (req, res) => {
    try { res.json(await storage.createMeterReading(insertMeterReadingSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.get("/api/meter-readings/:id", requireFleetMember(fleetIdFromMeterReading), async (req, res) => {
    const r = await storage.getMeterReading(Number(req.params.id));
    if (!r) return res.status(404).json({ error: "not_found" });
    res.json(r);
  });
  app.patch("/api/meter-readings/:id", requirePermission("meters.edit", fleetIdFromMeterReading), async (req, res) => {
    try {
      const partial = insertMeterReadingSchema.partial().parse(req.body);
      const updated = await storage.updateMeterReading(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/meter-readings/:id", requirePermission("meters.edit", fleetIdFromMeterReading), async (req, res) => {
    res.json({ ok: await storage.deleteMeterReading(Number(req.params.id)) });
  });

  // ---------- Maintenance schedules ----------
  const fleetIdFromSchedulesQuery = async (req: Request) => {
    if (req.query.fleetId != null) return Number(req.query.fleetId);
    if (req.query.assetId != null) return (await storage.getAsset(Number(req.query.assetId)))?.fleetId;
    return undefined;
  };
  const fleetIdFromScheduleBody = async (req: Request) => {
    if (req.body?.fleetId != null) return Number(req.body.fleetId);
    if (req.body?.assetId != null) return (await storage.getAsset(Number(req.body.assetId)))?.fleetId;
    return undefined;
  };
  app.get("/api/schedules", requireFleetMember(fleetIdFromSchedulesQuery), async (req, res) => {
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    if (fleetId != null) return res.json(await storage.listAllSchedulesForFleet(fleetId));
    res.json(await storage.listSchedules(assetId));
  });
  app.get("/api/schedules/:id", requireFleetMember(fleetIdFromSchedule), async (req, res) => {
    const s = await storage.getSchedule(Number(req.params.id));
    if (!s) return res.status(404).json({ error: "not_found" });
    res.json(s);
  });
  app.post("/api/schedules", requirePermission("schedules.manage", fleetIdFromScheduleBody), async (req, res) => {
    try { res.json(await storage.createSchedule(insertMaintenanceScheduleSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/schedules/:id", requirePermission("schedules.manage", fleetIdFromSchedule), async (req, res) => {
    try {
      const partial = insertMaintenanceScheduleSchema.partial().parse(req.body);
      const updated = await storage.updateSchedule(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/schedules/:id", requirePermission("schedules.manage", fleetIdFromSchedule), async (req, res) => {
    res.json({ ok: await storage.deleteSchedule(Number(req.params.id)) });
  });
  // ---------- Schedule assignments (fleet -> asset) ----------
  app.get("/api/schedule-assignments", requireFleetMember(fleetIdFromScheduleAssignmentsQuery), async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listScheduleAssignments(undefined, fleetId));
  });
  app.get("/api/schedules/:id/assignments", requireFleetMember(fleetIdFromScheduleAssignments), async (req, res) => {
    res.json(await storage.listScheduleAssignments(Number(req.params.id)));
  });
  app.put("/api/schedules/:id/assignments", requirePermission("schedules.manage", fleetIdFromSchedule), async (req, res) => {
    try {
      const body = z.object({ assetIds: z.array(z.coerce.number().int()) }).parse(req.body);
      res.json(await storage.setScheduleAssignments(Number(req.params.id), body.assetIds));
    } catch (err) { handleError(res, err); }
  });
  app.post("/api/schedules/:id/promote", requirePermission("schedules.manage", fleetIdFromSchedule), async (req, res) => {
    try {
      const body = z.object({ assetIds: z.array(z.coerce.number().int()).default([]) }).parse(req.body ?? {});
      res.json(await storage.promoteScheduleToFleet(Number(req.params.id), body.assetIds));
    } catch (err) { handleError(res, err); }
  });

  // ---------- Service events / line items ----------
  app.get("/api/service-events", requireFleetMember(fleetIdFromServiceEventsQuery), async (req, res) => {
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listServiceEvents(assetId, fleetId));
  });
  app.get("/api/service-events/:id", requireFleetMember(fleetIdFromServiceEvent), async (req, res) => {
    const e = await storage.getServiceEvent(Number(req.params.id));
    if (!e) return res.status(404).json({ error: "not_found" });
    res.json(e);
  });
  app.post("/api/service-events", requirePermission("service.log", fleetIdFromAssetBody), async (req, res) => {
    try { res.json(await storage.createServiceEvent(insertServiceEventSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/service-events/:id", requirePermission("service.edit", fleetIdFromServiceEvent), async (req, res) => {
    try {
      const partial = insertServiceEventSchema.partial().parse(req.body);
      const updated = await storage.updateServiceEvent(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/service-events/:id", requirePermission("service.edit", fleetIdFromServiceEvent), async (req, res) => {
    res.json({ ok: await storage.deleteServiceEvent(Number(req.params.id)) });
  });
  const fleetIdFromLineItemsQuery = async (req: Request) => {
    if (req.query.serviceEventId != null) {
      const event = await storage.getServiceEvent(Number(req.query.serviceEventId));
      if (!event) return undefined;
      return (await storage.getAsset(event.assetId))?.fleetId;
    }
    if (req.query.assetId != null) return (await storage.getAsset(Number(req.query.assetId)))?.fleetId;
    return undefined;
  };
  app.get("/api/service-line-items", requireFleetMember(fleetIdFromLineItemsQuery), async (req, res) => {
    const eventId = req.query.serviceEventId ? Number(req.query.serviceEventId) : undefined;
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    res.json(await storage.listLineItems(eventId, assetId));
  });
  app.post("/api/service-line-items", requirePermission("service.log", fleetIdFromServiceEventBody), async (req, res) => {
    try { res.json(await storage.createLineItem(insertServiceLineItemSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.put("/api/service-events/:id/line-items", requirePermission("service.edit", fleetIdFromServiceEventBody), async (req, res) => {
    try {
      const serviceEventId = Number(req.params.id);
      const lines = z.array(insertServiceLineItemSchema.omit({ serviceEventId: true }).extend({
        serviceEventId: z.number().optional(),
      })).parse(req.body);
      res.json(await storage.replaceLineItems(serviceEventId, lines.map(line => ({ ...line, serviceEventId }))));
    } catch (err) { handleError(res, err); }
  });

  // ---------- Inventory ----------
  app.get("/api/inventory-items", requireFleetMember(fleetIdFromQuery), async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listInventoryItems(fleetId));
  });
  app.get("/api/inventory-items/:id", requireFleetMember(fleetIdFromInventoryItem), async (req, res) => {
    const item = await storage.getInventoryItem(Number(req.params.id));
    if (!item) return res.status(404).json({ error: "not_found" });
    res.json(item);
  });
  app.post("/api/inventory-items", requirePermission("inventory.manage", fleetIdFromQuery), async (req, res) => {
    try { res.json(await storage.createInventoryItem(insertInventoryItemSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/inventory-items/:id", requirePermission("inventory.manage", fleetIdFromInventoryItem), async (req, res) => {
    try {
      const partial = insertInventoryItemSchema.partial().parse(req.body);
      const updated = await storage.updateInventoryItem(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/inventory-items/:id", requirePermission("inventory.manage", fleetIdFromInventoryItem), async (req, res) => {
    res.json({ ok: await storage.deleteInventoryItem(Number(req.params.id)) });
  });
  const fleetIdFromInventoryMovementsQuery = async (req: Request) => {
    const itemId = req.query.itemId != null ? Number(req.query.itemId) : undefined;
    if (itemId == null) return undefined;
    return (await storage.getInventoryItem(itemId))?.fleetId;
  };
  app.get("/api/inventory-movements", requireFleetMember(fleetIdFromInventoryMovementsQuery), async (req, res) => {
    const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;
    res.json(await storage.listInventoryMovements(itemId));
  });
  app.post("/api/inventory-movements", requirePermission("inventory.manage", fleetIdFromInventoryMovement), async (req, res) => {
    try { res.json(await storage.createInventoryMovement(insertInventoryMovementSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });

  // ---------- Attachments ----------
  app.get("/api/attachments", requireFleetMember(fleetIdFromAttachment), async (req, res) => {
    const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;
    res.json(await storage.listAttachments(entityType, entityId));
  });
  const attachmentWritePermission = async (req: Request): Promise<PermissionKey> => {
    const entityType = String(req.body?.entityType ?? "");
    return entityType === "service-event" ? "service.edit" : "inventory.manage";
  };
  app.post("/api/attachments", async (req, res, next) => {
    const key = await attachmentWritePermission(req);
    return requirePermission(key, fleetIdFromAttachment)(req, res, next);
  }, async (req, res) => {
    try { res.json(await storage.createAttachment(insertAttachmentSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });

  // ---------- App settings ----------
  app.get("/api/app-settings", requireAuth, async (_req, res) => res.json(await storage.listAppSettings()));
  app.patch("/api/app-settings", requireSystemAdmin, async (req, res) => {
    try {
      const entries = z.record(z.string(), z.string()).parse(req.body);
      const updated = await Promise.all(Object.entries(entries).map(([key, value]) =>
        storage.upsertAppSetting(insertAppSettingSchema.parse({
          key,
          value,
          updatedAt: new Date().toISOString(),
        }))
      ));
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });

  // ---------- System settings (auth mode + OIDC config) ----------
  app.get("/api/system-settings", requireSystemAdmin, async (_req, res) => {
    const settings = await storage.getSystemSettings();
    const { oidcClientSecret, ...rest } = settings;
    res.json({ ...rest, oidcClientSecretSet: !!oidcClientSecret });
  });
  // Narrow, non-admin-gated read of instance branding — used by the General
  // settings tab and the About dialog, both reachable by any authenticated
  // user. Deliberately excludes the OIDC config that GET /api/system-settings
  // returns for admins only.
  app.get("/api/org-info", requireAuth, async (_req, res) => {
    const settings = await storage.getSystemSettings();
    res.json({ orgName: settings.orgName, orgLogoUrl: settings.orgLogoUrl });
  });
  const systemSettingsPatchSchema = z.object({
    authMode: z.enum(["local", "oidc", "both"]).optional(),
    oidcIssuerUrl: z.string().url().optional().or(z.literal("")),
    oidcClientId: z.string().optional().or(z.literal("")),
    oidcClientSecret: z.string().optional(),
    oidcRedirectUri: z.string().url().optional().or(z.literal("")),
    orgName: z.string().optional().or(z.literal("")),
    orgLogoUrl: z.string().url().optional().or(z.literal("")),
    diagnosticsOverlayEnabled: z.boolean().optional(),
  });
  app.patch("/api/system-settings", requireSystemAdmin, async (req, res) => {
    try {
      const { oidcClientSecret, ...body } = systemSettingsPatchSchema.parse(req.body);
      const patch: Partial<InsertSystemSettings> = { ...body };
      // Write-only secret: omit or blank means "leave the stored value alone".
      if (oidcClientSecret) patch.oidcClientSecret = oidcClientSecret;
      const updated = await storage.updateSystemSettings(patch);
      const { oidcClientSecret: _secret, ...rest } = updated;
      res.json({ ...rest, oidcClientSecretSet: !!_secret });
    } catch (err) { handleError(res, err); }
  });
  app.post("/api/system-settings/test-oidc-connection", requireSystemAdmin, async (req, res) => {
    try {
      const body = z.object({
        issuerUrl: z.string().url(),
        clientId: z.string().min(1),
        clientSecret: z.string().optional(),
      }).parse(req.body);
      let clientSecret = body.clientSecret;
      if (!clientSecret) {
        const settings = await storage.getSystemSettings();
        clientSecret = settings.oidcClientSecret ?? undefined;
      }
      const result = await testOidcConnection(body.issuerUrl, body.clientId, clientSecret);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.json({ ok: false, error: String((err as Error)?.message ?? err) });
    }
  });

  // ---------- OIDC group -> fleet/role mappings ----------
  app.get("/api/oidc-group-mappings", requireSystemAdmin, async (_req, res) => {
    res.json(await storage.listOidcGroupMappings());
  });
  app.post("/api/oidc-group-mappings", requireSystemAdmin, async (req, res) => {
    try { res.json(await storage.createOidcGroupMapping(insertOidcGroupMappingSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/oidc-group-mappings/:id", requireSystemAdmin, async (req, res) => {
    try {
      const updated = await storage.updateOidcGroupMapping(Number(req.params.id), insertOidcGroupMappingSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/oidc-group-mappings/:id", requireSystemAdmin, async (req, res) => {
    try {
      const ok = await storage.deleteOidcGroupMapping(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });

  // ---------- Per-user auth provider management ----------
  app.post("/api/users/:id/convert-to-oidc", requireSystemAdmin, async (req, res) => {
    try {
      const updated = await storage.updateUser(Number(req.params.id), { authProvider: "oidc", passwordHash: null });
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.post("/api/users/:id/convert-to-local", requireSystemAdmin, async (req, res) => {
    try {
      const updated = await storage.updateUser(Number(req.params.id), { authProvider: "local", externalId: null, passwordHash: null });
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/users/:id/auth-settings", requireSystemAdmin, async (req, res) => {
    try {
      const body = z.object({ exemptFromGlobalAuthMode: z.boolean() }).parse(req.body);
      const updated = await storage.updateUser(Number(req.params.id), body);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });

  // ---------- Search ----------
  app.get("/api/search", requireFleetMember(fleetIdFromQuery), async (req, res) => {
    const fleetId = req.resolvedFleetId!;
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json({ assets: [], inventory: [], serviceEvents: [] });
    const matches = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
    const [lineItems, allAssets, allInventory, allServiceEvents] = await Promise.all([
      storage.listLineItems(),
      storage.listAssets(fleetId),
      storage.listInventoryItems(fleetId),
      storage.listServiceEvents(undefined, fleetId),
    ]);
    const fleetEventIds = new Set(allServiceEvents.map(e => e.id));
    const fleetLineItems = lineItems.filter(l => fleetEventIds.has(l.serviceEventId));
    const matchingLineEventIds = new Set(fleetLineItems
      .filter(l => matches(l.itemName) || matches(l.partNumber) || matches(l.brand) || matches(l.spec) || matches(l.notes))
      .map(l => l.serviceEventId));
    const assetResults = allAssets.filter(a =>
      matches(a.friendlyName) || matches(a.make) || matches(a.model) || matches(a.vin) ||
      matches(a.serial) || matches(a.plateNumber) || matches(a.plateJurisdiction) || matches(a.notes) || matches(a.assetType));
    const inventory = allInventory.filter(i =>
      matches(i.name) || matches(i.partNumber) || matches(i.sku) || matches(i.category) || matches(i.notes));
    const serviceEventResults = allServiceEvents.filter(s =>
      matches(s.title) || matches(s.notes) || matches(s.vendor) || matches(s.technician) || matchingLineEventIds.has(s.id));
    const serviceLineItems = fleetLineItems.filter(l =>
      matches(l.itemName) || matches(l.partNumber) || matches(l.brand) || matches(l.spec) || matches(l.notes));
    res.json({ assets: assetResults, inventory, serviceEvents: serviceEventResults, serviceLineItems });
  });

  // ---------- System status ----------
  app.get("/api/system/status", (_req, res) => {
    const startedAt = new Date(Date.now() - Math.round(process.uptime() * 1000));
    res.json({
      frontend: "ready",
      backend: "ready",
      database: "ready",
      databaseEngine: "PostgreSQL",
      uptimeSeconds: Math.round(process.uptime()),
      startedAt: startedAt.toISOString(),
      checkedAt: new Date().toISOString(),
    });
  });

  return httpServer;
}

import type { Express } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { storage } from "./storage";
import {
  insertFleetSchema,
  insertSiteSchema,
  insertUserSchema,
  insertFleetMembershipSchema,
  insertFleetEquipmentTypeSchema,
  insertFleetFuelTypeSchema,
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
} from "@shared/schema";
import { PERMISSION_CATALOG } from "@shared/permissions";
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
  app.get("/api/fleets", async (_req, res) => res.json(await storage.listFleets()));
  app.post("/api/fleets", async (req, res) => {
    try {
      const data = insertFleetSchema.parse(req.body);
      res.json(await storage.createFleet(data));
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleets/:id", async (req, res) => {
    try {
      const updated = await storage.updateFleet(Number(req.params.id), insertFleetSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });

  app.get("/api/fleets/:id/sites", async (req, res) => {
    res.json(await storage.listSites(Number(req.params.id)));
  });
  app.post("/api/sites", async (req, res) => {
    try { res.json(await storage.createSite(insertSiteSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });

  // ---------- Users / memberships ----------
  app.get("/api/users", async (_req, res) => res.json(await storage.listUsers()));
  app.post("/api/users", async (req, res) => {
    try { res.json(await storage.createUser(insertUserSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const ok = await storage.deleteUser(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/fleet-memberships", async (_req, res) => res.json(await storage.listFleetMemberships()));
  app.post("/api/fleet-memberships", async (req, res) => {
    try { res.json(await storage.upsertFleetMembership(insertFleetMembershipSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-memberships", async (req, res) => {
    try {
      const fleetId = Number(req.query.fleetId);
      const userId = Number(req.query.userId);
      const ok = await storage.deleteFleetMembership(fleetId, userId);
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/fleet-equipment-types", async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listFleetEquipmentTypes(fleetId));
  });
  app.post("/api/fleet-equipment-types", async (req, res) => {
    try { res.json(await storage.createFleetEquipmentType(insertFleetEquipmentTypeSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleet-equipment-types/:id", async (req, res) => {
    try {
      const updated = await storage.updateFleetEquipmentType(Number(req.params.id), insertFleetEquipmentTypeSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-equipment-types/:id", async (req, res) => {
    try {
      const ok = await storage.deleteFleetEquipmentType(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/fleet-fuel-types", async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listFleetFuelTypes(fleetId));
  });
  app.post("/api/fleet-fuel-types", async (req, res) => {
    try { res.json(await storage.createFleetFuelType(insertFleetFuelTypeSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleet-fuel-types/:id", async (req, res) => {
    try {
      const updated = await storage.updateFleetFuelType(Number(req.params.id), insertFleetFuelTypeSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/fleet-fuel-types/:id", async (req, res) => {
    try {
      const ok = await storage.deleteFleetFuelType(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/permissions", async (_req, res) => res.json(PERMISSION_CATALOG));
  app.get("/api/fleet-roles", async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listFleetRolesWithPermissions(fleetId));
  });
  app.post("/api/fleet-roles", async (req, res) => {
    try {
      const body = insertFleetRoleSchema.extend({ permissions: z.array(z.string()).optional() }).parse(req.body);
      const { permissions, ...roleInput } = body;
      const role = await storage.createFleetRole(roleInput);
      if (permissions) await storage.setFleetRolePermissions(role.id, permissions);
      res.json({ ...role, permissions: permissions ?? [] });
    } catch (err) { handleError(res, err); }
  });
  app.patch("/api/fleet-roles/:id", async (req, res) => {
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
  app.delete("/api/fleet-roles/:id", async (req, res) => {
    try {
      const ok = await storage.deleteFleetRole(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });

  app.get("/api/inventory-categories", async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listInventoryCategories(fleetId));
  });
  app.post("/api/inventory-categories", async (req, res) => {
    try { res.json(await storage.createInventoryCategory(insertInventoryCategorySchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/inventory-categories/:id", async (req, res) => {
    try {
      const updated = await storage.updateInventoryCategory(Number(req.params.id), insertInventoryCategorySchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/inventory-categories/:id", async (req, res) => {
    try {
      const ok = await storage.deleteInventoryCategory(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });
  app.get("/api/inventory-category-fields", async (req, res) => {
    const categoryId = req.query.categoryId ? Number(req.query.categoryId) : undefined;
    res.json(await storage.listInventoryCategoryFields(categoryId));
  });
  app.post("/api/inventory-category-fields", async (req, res) => {
    try { res.json(await storage.createInventoryCategoryField(insertInventoryCategoryFieldSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/inventory-category-fields/:id", async (req, res) => {
    try {
      const updated = await storage.updateInventoryCategoryField(Number(req.params.id), insertInventoryCategoryFieldSchema.partial().parse(req.body));
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/inventory-category-fields/:id", async (req, res) => {
    try {
      const ok = await storage.deleteInventoryCategoryField(Number(req.params.id));
      if (!ok) return res.status(404).json({ error: "not_found" });
      res.json({ ok: true });
    } catch (err) { handleError(res, err); }
  });

  // ---------- Assets ----------
  app.get("/api/assets", async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listAssets(fleetId));
  });
  app.get("/api/assets/:id", async (req, res) => {
    const a = await storage.getAsset(Number(req.params.id));
    if (!a) return res.status(404).json({ error: "not_found" });
    res.json(a);
  });
  app.post("/api/assets", async (req, res) => {
    try { res.json(await storage.createAsset(insertAssetSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/assets/:id", async (req, res) => {
    try {
      const partial = insertAssetSchema.partial().parse(req.body);
      const updated = await storage.updateAsset(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/assets/:id", async (req, res) => {
    const ok = await storage.deleteAsset(Number(req.params.id));
    res.json({ ok });
  });

  app.get("/api/assets/:id/history/:kind/export/:format", async (req, res) => {
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

  app.get("/api/assets/:id/history/:kind/print", async (req, res) => {
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
  app.get("/api/meter-readings", async (req, res) => {
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    res.json(await storage.listMeterReadings(assetId));
  });
  app.post("/api/meter-readings", async (req, res) => {
    try { res.json(await storage.createMeterReading(insertMeterReadingSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.get("/api/meter-readings/:id", async (req, res) => {
    const r = await storage.getMeterReading(Number(req.params.id));
    if (!r) return res.status(404).json({ error: "not_found" });
    res.json(r);
  });
  app.patch("/api/meter-readings/:id", async (req, res) => {
    try {
      const partial = insertMeterReadingSchema.partial().parse(req.body);
      const updated = await storage.updateMeterReading(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/meter-readings/:id", async (req, res) => {
    res.json({ ok: await storage.deleteMeterReading(Number(req.params.id)) });
  });

  // ---------- Maintenance schedules ----------
  app.get("/api/schedules", async (req, res) => {
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    if (fleetId != null) return res.json(await storage.listAllSchedulesForFleet(fleetId));
    res.json(await storage.listSchedules(assetId));
  });
  app.get("/api/schedules/:id", async (req, res) => {
    const s = await storage.getSchedule(Number(req.params.id));
    if (!s) return res.status(404).json({ error: "not_found" });
    res.json(s);
  });
  app.post("/api/schedules", async (req, res) => {
    try { res.json(await storage.createSchedule(insertMaintenanceScheduleSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/schedules/:id", async (req, res) => {
    try {
      const partial = insertMaintenanceScheduleSchema.partial().parse(req.body);
      const updated = await storage.updateSchedule(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/schedules/:id", async (req, res) => {
    res.json({ ok: await storage.deleteSchedule(Number(req.params.id)) });
  });
  // ---------- Schedule assignments (fleet -> asset) ----------
  app.get("/api/schedule-assignments", async (_req, res) => {
    res.json(await storage.listScheduleAssignments());
  });
  app.get("/api/schedules/:id/assignments", async (req, res) => {
    res.json(await storage.listScheduleAssignments(Number(req.params.id)));
  });
  app.put("/api/schedules/:id/assignments", async (req, res) => {
    try {
      const body = z.object({ assetIds: z.array(z.coerce.number().int()) }).parse(req.body);
      res.json(await storage.setScheduleAssignments(Number(req.params.id), body.assetIds));
    } catch (err) { handleError(res, err); }
  });
  app.post("/api/schedules/:id/promote", async (req, res) => {
    try {
      const body = z.object({ assetIds: z.array(z.coerce.number().int()).default([]) }).parse(req.body ?? {});
      res.json(await storage.promoteScheduleToFleet(Number(req.params.id), body.assetIds));
    } catch (err) { handleError(res, err); }
  });

  // ---------- Service events / line items ----------
  app.get("/api/service-events", async (req, res) => {
    const assetId = req.query.assetId ? Number(req.query.assetId) : undefined;
    res.json(await storage.listServiceEvents(assetId));
  });
  app.get("/api/service-events/:id", async (req, res) => {
    const e = await storage.getServiceEvent(Number(req.params.id));
    if (!e) return res.status(404).json({ error: "not_found" });
    res.json(e);
  });
  app.post("/api/service-events", async (req, res) => {
    try { res.json(await storage.createServiceEvent(insertServiceEventSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/service-events/:id", async (req, res) => {
    try {
      const partial = insertServiceEventSchema.partial().parse(req.body);
      const updated = await storage.updateServiceEvent(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/service-events/:id", async (req, res) => {
    res.json({ ok: await storage.deleteServiceEvent(Number(req.params.id)) });
  });
  app.get("/api/service-line-items", async (req, res) => {
    const eventId = req.query.serviceEventId ? Number(req.query.serviceEventId) : undefined;
    res.json(await storage.listLineItems(eventId));
  });
  app.post("/api/service-line-items", async (req, res) => {
    try { res.json(await storage.createLineItem(insertServiceLineItemSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.put("/api/service-events/:id/line-items", async (req, res) => {
    try {
      const serviceEventId = Number(req.params.id);
      const lines = z.array(insertServiceLineItemSchema.omit({ serviceEventId: true }).extend({
        serviceEventId: z.number().optional(),
      })).parse(req.body);
      res.json(await storage.replaceLineItems(serviceEventId, lines.map(line => ({ ...line, serviceEventId }))));
    } catch (err) { handleError(res, err); }
  });

  // ---------- Inventory ----------
  app.get("/api/inventory-items", async (req, res) => {
    const fleetId = req.query.fleetId ? Number(req.query.fleetId) : undefined;
    res.json(await storage.listInventoryItems(fleetId));
  });
  app.get("/api/inventory-items/:id", async (req, res) => {
    const item = await storage.getInventoryItem(Number(req.params.id));
    if (!item) return res.status(404).json({ error: "not_found" });
    res.json(item);
  });
  app.post("/api/inventory-items", async (req, res) => {
    try { res.json(await storage.createInventoryItem(insertInventoryItemSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });
  app.patch("/api/inventory-items/:id", async (req, res) => {
    try {
      const partial = insertInventoryItemSchema.partial().parse(req.body);
      const updated = await storage.updateInventoryItem(Number(req.params.id), partial);
      if (!updated) return res.status(404).json({ error: "not_found" });
      res.json(updated);
    } catch (err) { handleError(res, err); }
  });
  app.delete("/api/inventory-items/:id", async (req, res) => {
    res.json({ ok: await storage.deleteInventoryItem(Number(req.params.id)) });
  });
  app.get("/api/inventory-movements", async (req, res) => {
    const itemId = req.query.itemId ? Number(req.query.itemId) : undefined;
    res.json(await storage.listInventoryMovements(itemId));
  });
  app.post("/api/inventory-movements", async (req, res) => {
    try { res.json(await storage.createInventoryMovement(insertInventoryMovementSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });

  // ---------- Attachments ----------
  app.get("/api/attachments", async (req, res) => {
    const entityType = req.query.entityType ? String(req.query.entityType) : undefined;
    const entityId = req.query.entityId ? Number(req.query.entityId) : undefined;
    res.json(await storage.listAttachments(entityType, entityId));
  });
  app.post("/api/attachments", async (req, res) => {
    try { res.json(await storage.createAttachment(insertAttachmentSchema.parse(req.body))); }
    catch (err) { handleError(res, err); }
  });

  // ---------- App settings ----------
  app.get("/api/app-settings", async (_req, res) => res.json(await storage.listAppSettings()));
  app.patch("/api/app-settings", async (req, res) => {
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

  // ---------- Search ----------
  app.get("/api/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim().toLowerCase();
    if (!q) return res.json({ assets: [], inventory: [], serviceEvents: [] });
    const matches = (s: string | null | undefined) => !!s && s.toLowerCase().includes(q);
    const [lineItems, allAssets, allInventory, allServiceEvents] = await Promise.all([
      storage.listLineItems(),
      storage.listAssets(),
      storage.listInventoryItems(),
      storage.listServiceEvents(),
    ]);
    const matchingLineEventIds = new Set(lineItems
      .filter(l => matches(l.itemName) || matches(l.partNumber) || matches(l.brand) || matches(l.spec) || matches(l.notes))
      .map(l => l.serviceEventId));
    const assetResults = allAssets.filter(a =>
      matches(a.friendlyName) || matches(a.make) || matches(a.model) || matches(a.vin) ||
      matches(a.serial) || matches(a.plateNumber) || matches(a.plateJurisdiction) || matches(a.notes) || matches(a.assetType));
    const inventory = allInventory.filter(i =>
      matches(i.name) || matches(i.partNumber) || matches(i.sku) || matches(i.category) || matches(i.notes));
    const serviceEventResults = allServiceEvents.filter(s =>
      matches(s.title) || matches(s.notes) || matches(s.vendor) || matches(s.technician) || matchingLineEventIds.has(s.id));
    const serviceLineItems = lineItems.filter(l =>
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

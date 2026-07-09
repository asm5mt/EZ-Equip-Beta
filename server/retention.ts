import { auditLog } from "@shared/schema";
import { lt } from "drizzle-orm";
import { db, storage } from "./storage";

// Deletes audit_log rows older than systemSettings.auditLogRetentionDays.
// A null retention setting means "keep forever" — no-op.
export async function cleanupAuditLog(): Promise<void> {
  const settings = await storage.getSystemSettings();
  const retentionDays = settings.auditLogRetentionDays;
  if (retentionDays == null) return;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  await db.delete(auditLog).where(lt(auditLog.createdAt, cutoff));
}

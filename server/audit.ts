import { AsyncLocalStorage } from "node:async_hooks";
import { auditLog } from "@shared/schema";
import { db } from "./storage";

export interface AuditActor {
  userId: number | null;
  actorLabel: string;
  ip: string | null;
}

// Populated per-request by the middleware wired in server/index.ts (right
// after attachCurrentUser); absent for work triggered outside a request
// (e.g. bootstrap), in which case recordAudit falls back to "system".
export const auditContext = new AsyncLocalStorage<AuditActor>();

// Fields whose actual values must never be written to the audit log, in a
// diff or a snapshot. Both are secrets that happen to live on rows we audit.
const REDACTED_FIELDS = new Set(["passwordHash", "oidcClientSecret"]);

const REDACTED_MARKER = { changed: true } as const;

export interface RecordAuditInput {
  action: "create" | "update" | "delete";
  entityType: string;
  entityId: number;
  entityLabel: string;
  fleetId?: number | null;
  changes?: unknown;
}

// Never throws — a failure to log an action must not block the action
// itself. Failures are surfaced to the console instead.
export async function recordAudit(input: RecordAuditInput): Promise<void> {
  try {
    const actor = auditContext.getStore();
    await db.insert(auditLog).values({
      actorUserId: actor?.userId ?? null,
      actorLabel: actor?.actorLabel ?? "system",
      fleetId: input.fleetId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      entityLabel: input.entityLabel,
      changes: input.changes ?? null,
      ipAddress: actor?.ip ?? null,
    });
  } catch (err) {
    console.error(`[audit] Failed to record ${input.action} ${input.entityType}#${input.entityId}:`, err);
  }
}

// Returns { field: { from, to } } for only the keys that actually differ.
// Redacted fields report { changed: true } instead of the real values.
export function diffChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of keys) {
    const from = before[key];
    const to = after[key];
    if (from === to) continue;
    if (from instanceof Date && to instanceof Date && from.getTime() === to.getTime()) continue;
    out[key] = REDACTED_FIELDS.has(key) ? REDACTED_MARKER : { from, to };
  }
  return out;
}

// Snapshot of a row for create/delete audit entries, with secret fields
// replaced by a marker instead of their real value.
export function redactSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = REDACTED_FIELDS.has(key) && value != null ? REDACTED_MARKER : value;
  }
  return out;
}

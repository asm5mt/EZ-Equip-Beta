// Service-due rule. Either trigger: meter interval OR day interval.
// Whichever runs out first determines status.
//
// Schedules come in two scopes:
//   - 'asset': belongs to one asset (the existing per-asset rule).
//   - 'fleet': a shared template assigned to N assets via the
//              assignments table. For evaluation we filter completion
//              history by both scheduleId AND assetId so each assignment
//              tracks independently.

import type {
  MaintenanceSchedule,
  MaintenanceScheduleAssignment,
  ServiceEvent,
  Asset,
  ScheduleStatus,
} from "@shared/schema";

export interface ScheduleEvaluation {
  status: ScheduleStatus;
  remainingMeter: number | null; // null when schedule has no meter rule
  remainingDays: number | null; // null when schedule has no day rule
  triggerReason: "meter" | "day" | null; // which rule caused due/due-soon
  lastCompletedAt: Date | null;
  lastCompletedMeter: number | null;
  nextDueMeter: number | null;
  nextDueDate: Date | null;
}

export function evaluateSchedule(
  schedule: MaintenanceSchedule,
  asset: Asset,
  events: ServiceEvent[],
): ScheduleEvaluation {
  // History tracking is per asset, so fleet schedules filter on both keys.
  const matching = events
    .filter(e => e.scheduleId === schedule.id && e.assetId === asset.id)
    .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
  const last = matching[0] ?? null;

  const lastDate = last ? new Date(last.performedAt) : null;
  const lastMeter = last?.meterAtService ?? null;

  let remainingMeter: number | null = null;
  let nextDueMeter: number | null = null;
  if (schedule.meterInterval && schedule.meterInterval > 0) {
    if (lastMeter != null) {
      nextDueMeter = lastMeter + schedule.meterInterval;
      remainingMeter = nextDueMeter - asset.currentMeter;
    } else {
      // No history. Treat current meter as baseline so the schedule reads
      // as "due in <interval>" rather than instantly overdue.
      nextDueMeter = asset.currentMeter + schedule.meterInterval;
      remainingMeter = schedule.meterInterval;
    }
  }

  let remainingDays: number | null = null;
  let nextDueDate: Date | null = null;
  if (schedule.dayInterval && schedule.dayInterval > 0) {
    const baseline = lastDate ?? new Date();
    nextDueDate = new Date(baseline);
    nextDueDate.setDate(nextDueDate.getDate() + schedule.dayInterval);
    const msPerDay = 1000 * 60 * 60 * 24;
    remainingDays = Math.ceil((nextDueDate.getTime() - Date.now()) / msPerDay);
  }

  if (!last && schedule.meterInterval == null && schedule.dayInterval == null) {
    return {
      status: "no-history",
      remainingMeter, remainingDays, triggerReason: null,
      lastCompletedAt: null, lastCompletedMeter: null,
      nextDueMeter: null, nextDueDate: null,
    };
  }

  // Status — either trigger.
  let status: ScheduleStatus = "ok";
  let triggerReason: "meter" | "day" | null = null;

  const meterDueSoon = schedule.meterDueSoon ?? (schedule.meterInterval ? Math.max(50, Math.round(schedule.meterInterval * 0.05)) : null);
  const dayDueSoon = schedule.dayDueSoon ?? (schedule.dayInterval ? Math.min(30, Math.round(schedule.dayInterval * 0.1)) : null);

  if (remainingMeter != null) {
    if (remainingMeter <= 0) { status = "overdue"; triggerReason = "meter"; }
    else if (meterDueSoon != null && remainingMeter <= meterDueSoon) {
      if (status === "ok") { status = "due-soon"; triggerReason = "meter"; }
    }
  }
  if (remainingDays != null) {
    if (remainingDays <= 0) {
      status = "overdue";
      // Earlier trigger wins when both overdue; pick the one with fewer remaining days vs miles equivalent.
      triggerReason = triggerReason === "meter" && remainingMeter != null && remainingMeter < remainingDays ? "meter" : "day";
    } else if (dayDueSoon != null && remainingDays <= dayDueSoon) {
      if (status !== "overdue" && status !== "due-soon") {
        status = "due-soon"; triggerReason = "day";
      } else if (status === "due-soon" && (remainingMeter == null || remainingDays < remainingMeter)) {
        triggerReason = "day";
      }
    }
  }

  if (!last && status !== "overdue" && status !== "due-soon") {
    return {
      status: "no-history",
      remainingMeter, remainingDays, triggerReason: null,
      lastCompletedAt: null, lastCompletedMeter: null,
      nextDueMeter, nextDueDate,
    };
  }

  return {
    status, remainingMeter, remainingDays, triggerReason,
    lastCompletedAt: lastDate, lastCompletedMeter: lastMeter,
    nextDueMeter, nextDueDate,
  };
}

export function statusLabel(s: ScheduleStatus): string {
  switch (s) {
    case "ok": return "OK";
    case "due-soon": return "Due Soon";
    case "overdue": return "Overdue";
    default: return "No History";
  }
}

export function statusClass(s: ScheduleStatus): string {
  switch (s) {
    case "ok": return "status-ok font-semibold";
    case "due-soon": return "status-warn font-semibold";
    case "overdue": return "status-overdue font-semibold";
    default: return "border-dashed border-border text-muted-foreground bg-muted/25";
  }
}

// ---------------------------------------------------------------------------
// Schedule expansion + aggregate helpers
// ---------------------------------------------------------------------------

export interface ScheduleAssetEval {
  schedule: MaintenanceSchedule;
  asset: Asset;
  evaluation: ScheduleEvaluation;
}

// Expand schedules + assignments into the list of (schedule, asset)
// evaluations that should be visible on the global Maintenance page.
export function expandScheduleEvaluations(
  schedules: MaintenanceSchedule[],
  assignments: MaintenanceScheduleAssignment[],
  assets: Asset[],
  events: ServiceEvent[],
): ScheduleAssetEval[] {
  const assetsById = new Map(assets.map(a => [a.id, a]));
  const assignmentsBySchedule = new Map<number, number[]>();
  for (const a of assignments) {
    const arr = assignmentsBySchedule.get(a.scheduleId) ?? [];
    arr.push(a.assetId);
    assignmentsBySchedule.set(a.scheduleId, arr);
  }
  const out: ScheduleAssetEval[] = [];
  for (const s of schedules) {
    if (!s.active) continue;
    if (s.scope === "fleet") {
      const ids = assignmentsBySchedule.get(s.id) ?? [];
      for (const assetId of ids) {
        const a = assetsById.get(assetId);
        if (!a) continue;
        out.push({ schedule: s, asset: a, evaluation: evaluateSchedule(s, a, events) });
      }
    } else if (s.assetId != null) {
      const a = assetsById.get(s.assetId);
      if (!a) continue;
      out.push({ schedule: s, asset: a, evaluation: evaluateSchedule(s, a, events) });
    }
  }
  return out;
}

const STATUS_RANK: Record<ScheduleStatus, number> = {
  overdue: 0,
  "due-soon": 1,
  ok: 2,
  "no-history": 3,
};

export function sortByUrgency(rows: ScheduleAssetEval[]): ScheduleAssetEval[] {
  return [...rows].sort((x, y) => STATUS_RANK[x.evaluation.status] - STATUS_RANK[y.evaluation.status]);
}

export function worstStatus(statuses: ScheduleStatus[]): ScheduleStatus {
  if (statuses.length === 0) return "no-history";
  return statuses.reduce((acc, s) => (STATUS_RANK[s] < STATUS_RANK[acc] ? s : acc), statuses[0]);
}

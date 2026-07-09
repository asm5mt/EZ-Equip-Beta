export type EditModeState = "new" | "edit" | "view";

export function modeLabel(mode: EditModeState) {
  if (mode === "edit") return "Edit Mode";
  if (mode === "view") return "View Mode";
  return "New";
}

export function modeBadgeClass(mode: EditModeState) {
  if (mode === "edit") {
    return "border-[hsl(var(--status-warn)/0.4)] bg-[hsl(var(--status-warn)/0.10)] text-[hsl(var(--status-warn))]";
  }
  if (mode === "view") {
    return "border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.10)] text-[hsl(var(--primary))]";
  }
  return "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.10)] text-[hsl(var(--status-ok))]";
}

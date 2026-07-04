export type EditModeState = "new" | "edit";

export function modeLabel(mode: EditModeState) {
  return mode === "edit" ? "Edit Mode" : "New";
}

export function modeBadgeClass(mode: EditModeState) {
  if (mode === "edit") {
    return "border-[hsl(var(--status-warn)/0.4)] bg-[hsl(var(--status-warn)/0.10)] text-[hsl(var(--status-warn))]";
  }
  return "border-[hsl(var(--status-ok)/0.4)] bg-[hsl(var(--status-ok)/0.10)] text-[hsl(var(--status-ok))]";
}

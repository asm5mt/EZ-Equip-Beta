import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Bug, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/lib/app-context";
import { useDiagnosticsStack } from "@/lib/diagnostics-context";
import { useToast } from "@/hooks/use-toast";
import { versionString } from "@/lib/version";
import type { SystemSettings } from "@shared/schema";

type SystemSettingsResponse = Omit<SystemSettings, "oidcClientSecret"> & { oidcClientSecretSet: boolean };

// Mirrors the route table in App.tsx so the overlay can show a page name
// without extra per-page instrumentation. Keep in sync if routes change.
const PAGE_ROUTES: { pattern: RegExp; name: string }[] = [
  { pattern: /^\/$/, name: "Dashboard" },
  { pattern: /^\/assets\/new$/, name: "AssetForm (new)" },
  { pattern: /^\/assets\/[^/]+\/edit$/, name: "AssetForm (edit)" },
  { pattern: /^\/assets\/[^/]+\/schedules\/new$/, name: "ScheduleForm (asset, new)" },
  { pattern: /^\/assets\/[^/]+\/schedules\/[^/]+\/edit$/, name: "ScheduleForm (asset, edit)" },
  { pattern: /^\/maintenance\/schedules\/new$/, name: "ScheduleForm (fleet, new)" },
  { pattern: /^\/maintenance\/schedules\/[^/]+\/edit$/, name: "ScheduleForm (fleet, edit)" },
  { pattern: /^\/assets\/[^/]+\/meter\/new$/, name: "MeterForm (new)" },
  { pattern: /^\/assets\/[^/]+\/meter\/[^/]+\/edit$/, name: "MeterForm (edit)" },
  { pattern: /^\/assets\/[^/]+\/meter$/, name: "MeterForm" },
  { pattern: /^\/assets\/[^/]+\/services\/new$/, name: "ServiceForm (new)" },
  { pattern: /^\/assets\/[^/]+\/service\/new$/, name: "ServiceForm (new)" },
  { pattern: /^\/events\/[^/]+\/edit$/, name: "ServiceForm (edit event)" },
  { pattern: /^\/assets\/[^/]+$/, name: "AssetDetail" },
  { pattern: /^\/meter-readings$/, name: "MeterReadings" },
  { pattern: /^\/events$/, name: "Events" },
  { pattern: /^\/maintenance$/, name: "Maintenance" },
  { pattern: /^\/inventory\/new$/, name: "InventoryForm (new)" },
  { pattern: /^\/inventory\/[^/]+\/add-stock$/, name: "InventoryStockForm" },
  { pattern: /^\/inventory\/[^/]+\/edit$/, name: "InventoryForm (edit)" },
  { pattern: /^\/inventory$/, name: "Inventory" },
  { pattern: /^\/service-facilities$/, name: "ServiceFacilities" },
  { pattern: /^\/reports$/, name: "Reports" },
  { pattern: /^\/search$/, name: "Search" },
  { pattern: /^\/fleets$/, name: "Fleets" },
  { pattern: /^\/settings\/fleets\/[^/]+$/, name: "FleetSettings" },
  { pattern: /^\/settings$/, name: "Settings" },
  { pattern: /^\/admin$/, name: "Settings" },
];

function getPageName(path: string): string {
  return PAGE_ROUTES.find(r => r.pattern.test(path))?.name ?? "NotFound";
}

function formatContext(context: Record<string, unknown> | undefined): string {
  if (!context || Object.keys(context).length === 0) return "(no context)";
  return Object.entries(context).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
}

function buildDiagnosticsText(
  location: string,
  pageName: string,
  stack: ReturnType<typeof useDiagnosticsStack>,
): string {
  const lines = [
    "EZ Equip diagnostics",
    `Version: ${versionString()}`,
    `Route: ${location}`,
    `Page: ${pageName}`,
    "Modal stack:",
  ];
  if (stack.length === 0) {
    lines.push("  (none)");
  } else {
    stack.forEach((entry, i) => {
      lines.push(`  ${i + 1}. ${entry.name} — ${formatContext(entry.context)}`);
    });
  }
  return lines.join("\n");
}

export function DiagnosticsOverlay() {
  const { systemAdmin } = useAppContext();
  const [location] = useLocation();
  const stack = useDiagnosticsStack();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);

  const settingsQ = useQuery<SystemSettingsResponse>({
    queryKey: ["/api/system-settings"],
    enabled: systemAdmin,
  });
  const diagnosticsOverlayEnabled = settingsQ.data?.diagnosticsOverlayEnabled ?? false;
  const enabledRef = useRef(diagnosticsOverlayEnabled);
  useEffect(() => { enabledRef.current = diagnosticsOverlayEnabled; }, [diagnosticsOverlayEnabled]);

  // Structural gate: the listener is only ever attached when the current
  // user is a system admin — non-admin sessions never have this listener at
  // all, not just a callback that no-ops. Whether the Settings toggle is on
  // is checked at call time via the ref above, so flipping that toggle
  // doesn't require detaching/reattaching this listener.
  useEffect(() => {
    if (!systemAdmin) return;
    const handler = (e: KeyboardEvent) => {
      const isToggleCombo = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d";
      if (!isToggleCombo || !enabledRef.current) return;
      e.preventDefault();
      setVisible(v => !v);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [systemAdmin]);

  useEffect(() => {
    if (!diagnosticsOverlayEnabled) setVisible(false);
  }, [diagnosticsOverlayEnabled]);

  // Live "element under cursor" reader: walk up from whatever's under the
  // pointer to the nearest ancestor carrying a data-testid, so the panel
  // reflects it in real time without any new registration plumbing. Throttled
  // to every 100ms — mousemove fires far more often than the label needs to
  // update.
  const [hoveredTestId, setHoveredTestId] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    let lastRun = 0;
    const handler = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastRun < 100) return;
      lastRun = now;
      let node = document.elementFromPoint(e.clientX, e.clientY);
      while (node && !node.hasAttribute("data-testid")) {
        node = node.parentElement;
      }
      setHoveredTestId(node?.getAttribute("data-testid") ?? null);
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, [visible]);

  if (!systemAdmin || !diagnosticsOverlayEnabled || !visible) return null;

  const pageName = getPageName(location);

  const copyDiagnostics = async () => {
    const text = buildDiagnosticsText(location, pageName, stack);
    await navigator.clipboard.writeText(text);
    toast({ title: "Diagnostics copied to clipboard" });
  };

  return createPortal(
    <div
      className="pointer-events-auto fixed bottom-4 right-4 z-[9999] w-80 rounded-lg border border-border bg-background/85 shadow-lg backdrop-blur-sm"
      data-testid="panel-diagnostics-overlay"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground">
          <Bug className="size-3.5" /> DIAGNOSTICS
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6"
          onClick={() => setVisible(false)}
          aria-label="Close diagnostics overlay"
          data-testid="button-close-diagnostics-overlay"
        >
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="space-y-2 px-3 py-2.5 text-xs">
        <div><span className="text-muted-foreground">Version:</span> {versionString()}</div>
        <div className="truncate"><span className="text-muted-foreground">Route:</span> {location}</div>
        <div><span className="text-muted-foreground">Page:</span> {pageName}</div>
        <div className="truncate" data-testid="text-diagnostics-hovered-element">
          <span className="text-muted-foreground">Element:</span> {hoveredTestId ?? "(none)"}
        </div>
        <div>
          <div className="text-muted-foreground mb-1">Modal stack:</div>
          {stack.length === 0 ? (
            <div className="text-muted-foreground italic">(none)</div>
          ) : (
            <ul className="space-y-1">
              {stack.map((entry, i) => (
                <li key={entry.id} className="rounded border border-border/60 px-2 py-1">
                  <div className="font-medium">{i + 1}. {entry.name}</div>
                  <div className="text-muted-foreground break-words">{formatContext(entry.context)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="border-t border-border px-3 py-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={copyDiagnostics}
          data-testid="button-copy-diagnostics"
        >
          <Copy className="size-3.5 mr-1.5" /> Copy diagnostics
        </Button>
      </div>
    </div>,
    document.body,
  );
}

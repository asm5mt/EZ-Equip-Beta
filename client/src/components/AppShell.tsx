import { useState, useEffect, ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { LayoutDashboard, Truck, Wrench, Boxes, Building2, Network, Search as SearchIcon, Plus, Sun, Moon, SlidersHorizontal, FileText } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Logo } from "./Logo";
import { QuickAddSheet } from "./QuickAddSheet";
import { GlobalSearch } from "./GlobalSearch";
import { UserSwitcher } from "./UserSwitcher";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAppContext } from "@/lib/app-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { versionString, APP_VERSION, BUILD_NUMBER, BUILD_TIME } from "@/lib/version";
import type { AppSetting } from "@shared/schema";

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/assets", label: "Assets", icon: Truck },
  { href: "/maintenance", label: "Maintenance", icon: Wrench },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/service-facilities", label: "Service Facilities", icon: Building2 },
  { href: "/reports", label: "Reports", icon: FileText },
  { href: "/fleets", label: "Fleets", icon: Network },
  { href: "/settings", label: "Settings", icon: SlidersHorizontal },
];

type ThemeMode = "auto" | "dark" | "light";

export function AppShell({ title, subtitle, children }: AppShellProps) {
  const [location] = useLocation();
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>("auto");
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const { fleet, canEdit } = useAppContext();
  const settingsQ = useQuery<AppSetting[]>({ queryKey: ["/api/app-settings"] });
  const saveSettings = useMutation({
    mutationFn: async (settings: Record<string, string>) => apiRequest("PATCH", "/api/app-settings", settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/app-settings"] }),
  });

  useEffect(() => {
    const stored = settingsQ.data?.find(s => s.key === "themeMode")?.value as ThemeMode | undefined;
    if (stored === "auto" || stored === "dark" || stored === "light") setTheme(stored);
  }, [settingsQ.data]);

  useEffect(() => {
    const apply = () => {
      const next = theme === "auto"
        ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
        : theme;
      setResolvedTheme(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.body.classList.toggle("dark", next === "dark");
    };
    apply();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    const handler = (event: Event) => {
      const next = (event as CustomEvent<ThemeMode>).detail;
      if (next === "auto" || next === "dark" || next === "light") setTheme(next);
    };
    window.addEventListener("ez-equip-theme", handler);
    return () => window.removeEventListener("ez-equip-theme", handler);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ settings?: Record<string, string> }>).detail;
      if (detail?.settings) void saveSettings.mutate(detail.settings);
    };
    window.addEventListener("ez-equip-save-settings", handler);
    return () => window.removeEventListener("ez-equip-save-settings", handler);
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    void saveSettings.mutate({ themeMode: next });
  };

  // Keyboard shortcut: ⌘/Ctrl+K opens search.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-40 w-[220px]
          bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))]
          border-r border-[hsl(var(--sidebar-border))]
          flex flex-col transition-transform
          ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0
        `}
        data-testid="nav-sidebar"
      >
        <div className="px-5 pt-6 pb-5 border-b border-[hsl(var(--sidebar-border))]">
          <Logo size={28} />
          <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-[hsl(var(--sidebar-foreground))]/55">
            {fleet?.name ?? "Instance"}
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(item => {
            // Individual fleet settings pages live under /settings/fleets/:id but
            // conceptually belong to the Fleets nav item, not Settings.
            const active = location.startsWith("/settings/fleets")
              ? item.href === "/fleets"
              : location === item.href || (item.href !== "/" && location.startsWith(item.href));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium
                  transition-colors
                  ${active
                    ? "bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))] ring-1 ring-[hsl(var(--sidebar-primary))]/40"
                    : "text-[hsl(var(--sidebar-foreground))]/75 hover-elevate"}
                `}
                data-testid={`link-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setMobileNavOpen(false)}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-[hsl(var(--sidebar-border))] space-y-2">
          <SystemStatus />
          <div className="text-[10px] text-[hsl(var(--sidebar-foreground))]/45 tracking-wide">
            (C) 2026 Sessanna Consulting · {versionString()}
          </div>
        </div>
      </aside>

      {mobileNavOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm"
          data-testid="header-topbar"
        >
          <div className="flex items-center gap-2 sm:gap-4 px-4 sm:px-6 lg:px-8 py-3.5">
            <button
              className="lg:hidden inline-flex items-center justify-center size-8 rounded-md border border-border hover-elevate"
              onClick={() => setMobileNavOpen(o => !o)}
              data-testid="button-mobile-nav"
              aria-label="Toggle navigation"
            >
              <span className="block w-4 h-0.5 bg-foreground relative before:content-[''] before:absolute before:-top-1.5 before:left-0 before:w-4 before:h-0.5 before:bg-foreground after:content-[''] after:absolute after:top-1.5 after:left-0 after:w-4 after:h-0.5 after:bg-foreground" />
            </button>
            <div className="min-w-0 flex-1 overflow-hidden">
              <h1 className="text-lg sm:text-xl font-semibold leading-tight truncate" data-testid="text-page-title">{title}</h1>
              {subtitle && subtitle === subtitle.toUpperCase() && (
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground" data-testid="text-page-subtitle">
                  {subtitle}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0 md:w-auto md:px-3"
                data-testid="button-quick-add"
                onClick={() => setQuickAddOpen(true)}
                disabled={!canEdit}
                aria-label="Quick Add"
              >
                <Plus className="size-4 md:mr-1.5" />
                <span className="hidden md:inline">Quick Add</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0 md:w-auto md:px-3"
                data-testid="button-search"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
              >
                <SearchIcon className="size-4 md:mr-1.5" />
                <span className="hidden md:inline">Search</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-9 px-0 md:w-auto md:px-3"
                data-testid="button-toggle-theme"
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                {resolvedTheme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <UserSwitcher />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6">{children}</main>
      </div>

      <QuickAddSheet open={quickAddOpen} onOpenChange={setQuickAddOpen} />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

function SystemStatus() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("GET", "/api/system/status");
      setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => { if (open) void load(); }}>
      <DialogTrigger asChild>
        <button
          className="w-full flex items-center gap-2 text-xs text-[hsl(var(--sidebar-foreground))]/70 hover:text-[hsl(var(--sidebar-foreground))] rounded-md py-1"
          data-testid="button-system-status"
        >
          <span className="size-2 rounded-full bg-[hsl(var(--status-ok))]" />
          System Ready
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>System Status</DialogTitle>
        </DialogHeader>
        {loading && <p className="text-sm text-muted-foreground">Checking services…</p>}
        {!loading && status && (
          <div className="grid gap-3 text-sm">
            <StatusLine label="Frontend" value={status.frontend} />
            <StatusLine label="Backend API" value={status.backend} />
            <StatusLine label={status.databaseEngine ?? "Database"} value={status.database} />
            <div className="grid gap-1.5 pt-2 border-t border-border text-xs text-muted-foreground">
              <div>Version: {APP_VERSION} · Build: {BUILD_NUMBER}</div>
              <div>Built: {new Date(BUILD_TIME).toLocaleString()}</div>
              <div>Uptime: {status.uptimeSeconds}s · Checked: {new Date(status.checkedAt).toLocaleString()}</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border p-3" data-testid={`status-line-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="inline-flex items-center gap-2 font-medium">
        <span className="size-2 rounded-full bg-[hsl(var(--status-ok))]" />
        {value}
      </span>
    </div>
  );
}

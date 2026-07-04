import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon } from "lucide-react";
import type { Asset, InventoryItem, ServiceEvent } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";
import { formatDate, formatNumber, meterUnitLabel } from "@/lib/format";

interface SearchResult {
  assets: Asset[];
  inventory: InventoryItem[];
  serviceEvents: ServiceEvent[];
}

export default function Search() {
  const { fleet } = useAppContext();
  const [q, setQ] = useState("");

  const resultsQ = useQuery<SearchResult>({
    queryKey: ["/api/search", { q }],
    enabled: q.trim().length >= 1,
  });

  const data = resultsQ.data ?? { assets: [], inventory: [], serviceEvents: [] };

  return (
    <AppShell title="Search" subtitle={fleet?.name}>
      <div className="space-y-6">
        <header>
          <h2 className="text-2xl font-semibold tracking-tight">Search</h2>
          <p className="text-sm text-muted-foreground mt-1">Find assets, inventory, and service events by name, VIN, part number, vendor, or notes.</p>
        </header>

        <Card className="p-5 space-y-2">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Try: Silverado, 1GCHK29U, oil filter, NAPA…"
              className="pl-9"
              data-testid="input-search-query"
            />
          </div>
          <p className="text-xs text-muted-foreground">{q ? `Searching for "${q}"` : "Type to begin."}</p>
        </Card>

        {q && (
          <>
            <Card className="p-5">
              <h3 className="font-semibold mb-3">Assets ({data.assets.length})</h3>
              {data.assets.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
              <div className="grid gap-2">
                {data.assets.map(a => (
                  <Link key={a.id} href={`/assets/${a.id}`} className="block p-3 rounded-md border border-border hover-elevate" data-testid={`result-asset-${a.id}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-medium">{a.friendlyName}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {[a.year, a.make, a.model, a.trim].filter(Boolean).join(" ")}
                            {a.vin && <> &bull; VIN {a.vin}</>}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground num">{formatNumber(a.currentMeter)} {meterUnitLabel(a.meterType, a.meterLabel)}</div>
                      </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold mb-3">Inventory ({data.inventory.length})</h3>
              {data.inventory.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
              <div className="grid gap-2">
                {data.inventory.map(i => (
                  <Link key={i.id} href={`/inventory/${i.id}/edit`} className="block p-3 rounded-md border border-border hover-elevate" data-testid={`result-inventory-${i.id}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-medium">{i.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {i.partNumber && <>P/N {i.partNumber} &bull; </>}{i.category}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground num">{formatNumber(i.onHand)} {i.unit}</div>
                      </div>
                  </Link>
                ))}
              </div>
            </Card>

            <Card className="p-5">
              <h3 className="font-semibold mb-3">Service Events ({data.serviceEvents.length})</h3>
              {data.serviceEvents.length === 0 && <p className="text-sm text-muted-foreground">No matches.</p>}
              <div className="grid gap-2">
                {data.serviceEvents.map(s => (
                  <Link key={s.id} href={`/assets/${s.assetId}`} className="block p-3 rounded-md border border-border hover-elevate" data-testid={`result-event-${s.id}`}>
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                          <div className="font-medium">{s.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{s.vendor || s.eventType}</div>
                        </div>
                        <div className="text-xs text-muted-foreground num">{formatDate(s.performedAt)}</div>
                      </div>
                  </Link>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

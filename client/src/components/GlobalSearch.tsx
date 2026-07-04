import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import type { Asset, InventoryItem, ServiceEvent, ServiceLineItem } from "@shared/schema";
import { Truck, Boxes, Wrench, PackageSearch } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatDate } from "@/lib/format";

interface SearchResults {
  assets: Asset[];
  inventory: InventoryItem[];
  serviceEvents: ServiceEvent[];
  serviceLineItems: ServiceLineItem[];
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function GlobalSearch({ open, onOpenChange }: Props) {
  const [, navigate] = useLocation();
  const [q, setQ] = useState("");

  useEffect(() => { if (open) setQ(""); }, [open]);

  const enabled = open && q.trim().length > 0;
  const { data } = useQuery<SearchResults>({
    queryKey: ["/api/search", q.trim()],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/search?q=${encodeURIComponent(q.trim())}`);
      return res.json();
    },
    enabled,
  });

  const go = (path: string) => { onOpenChange(false); navigate(path); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0">
        <DialogHeader className="px-4 pt-4">
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2">
          <Input
            autoFocus
            placeholder="Search assets, inventory, services…"
            value={q}
            onChange={e => setQ(e.target.value)}
            data-testid="input-global-search"
          />
        </div>
        <div className="max-h-80 overflow-y-auto px-2 pb-3">
          {!enabled && (
            <div className="px-3 py-6 text-sm text-muted-foreground">Type to search across the fleet.</div>
          )}
          {enabled && data && (
            <>
              {data.assets.length === 0 && data.inventory.length === 0 && data.serviceEvents.length === 0 && (data.serviceLineItems?.length ?? 0) === 0 && (
                <div className="px-3 py-6 text-sm text-muted-foreground">No results.</div>
              )}
              {data.assets.length > 0 && <SearchSection title="Assets">
                {data.assets.map(a => (
                  <button key={a.id} className="w-full text-left px-3 py-2 rounded-md hover-elevate flex items-center gap-3" onClick={() => go(`/assets/${a.id}`)} data-testid={`searchresult-asset-${a.id}`}>
                    <Truck className="size-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{a.friendlyName}</div>
                      <div className="text-xs text-muted-foreground truncate">{[a.year, a.make, a.model].filter(Boolean).join(" ")}</div>
                    </div>
                  </button>
                ))}
              </SearchSection>}
              {data.inventory.length > 0 && <SearchSection title="Inventory">
                {data.inventory.map(i => (
                  <button key={i.id} className="w-full text-left px-3 py-2 rounded-md hover-elevate flex items-center gap-3" onClick={() => go(`/inventory`)} data-testid={`searchresult-inventory-${i.id}`}>
                    <Boxes className="size-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{i.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{i.partNumber ?? i.sku ?? i.category}</div>
                    </div>
                  </button>
                ))}
              </SearchSection>}
              {data.serviceEvents.length > 0 && <SearchSection title="Service events">
                {data.serviceEvents.map(s => (
                  <button key={s.id} className="w-full text-left px-3 py-2 rounded-md hover-elevate flex items-center gap-3" onClick={() => go(`/events`)} data-testid={`searchresult-event-${s.id}`}>
                    <Wrench className="size-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{formatDate(s.performedAt)}{s.vendor ? ` · ${s.vendor}` : ""}{s.notes ? ` · ${s.notes}` : ""}</div>
                    </div>
                  </button>
                ))}
              </SearchSection>}
              {(data.serviceLineItems?.length ?? 0) > 0 && <SearchSection title="Service line items">
                {data.serviceLineItems.map(line => (
                  <button key={line.id} className="w-full text-left px-3 py-2 rounded-md hover-elevate flex items-center gap-3" onClick={() => go(`/events`)} data-testid={`searchresult-line-${line.id}`}>
                    <PackageSearch className="size-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{line.itemName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {[line.partNumber, line.brand, line.spec, line.notes].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </button>
                ))}
              </SearchSection>}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{title}</div>
      <div>{children}</div>
    </div>
  );
}

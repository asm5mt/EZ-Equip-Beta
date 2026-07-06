import { useState } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { ArrowLeft, Truck, Gauge, Wrench, Boxes } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Asset } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

type PendingAction = "service" | "meter" | null;

export function QuickAddSheet({ open, onOpenChange }: Props) {
  const [, navigate] = useLocation();
  const { fleet } = useAppContext();
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const assetsQ = useQuery<Asset[]>({
    queryKey: ["/api/assets", { fleetId: fleet?.id }],
    enabled: !!fleet,
  });
  const assets = assetsQ.data ?? [];
  // Avoid a flash of "disabled" while the assets query is still loading —
  // only treat the fleet as asset-less once we've actually confirmed it.
  const noAssetsConfirmed = !assetsQ.isLoading && assets.length === 0;

  const reset = () => {
    setPendingAction(null);
    setSelectedAssetId("");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const go = (path: string) => {
    reset();
    onOpenChange(false);
    navigate(path);
  };

  const startAssetPick = (action: PendingAction) => {
    setSelectedAssetId("");
    setPendingAction(action);
  };

  const continuePendingAction = () => {
    if (!selectedAssetId || !pendingAction) return;
    const path = pendingAction === "service" ? `/assets/${selectedAssetId}/services/new` : `/assets/${selectedAssetId}/meter/new`;
    go(path);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Quick Add</SheetTitle>
          <SheetDescription>
            {pendingAction ? "Choose which asset this is for." : "Jump to the most common entry points."}
          </SheetDescription>
        </SheetHeader>

        {pendingAction ? (
          <div className="mt-6 space-y-4">
            <div>
              <Label>Asset</Label>
              <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                <SelectTrigger data-testid="select-quickadd-asset"><SelectValue placeholder="Choose an asset" /></SelectTrigger>
                <SelectContent>
                  {assets.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.friendlyName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingAction(null)} data-testid="quickadd-asset-back">
                <ArrowLeft className="size-4 mr-1.5" /> Back
              </Button>
              <Button disabled={!selectedAssetId} onClick={continuePendingAction} data-testid="quickadd-asset-continue">
                Continue
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-2">
            <Button variant="outline" className="justify-start h-auto py-3" data-testid="quickadd-asset" onClick={() => go("/assets/new")}>
              <Truck className="size-4 mr-3" />
              <span className="flex flex-col items-start">
                <span className="font-medium">New asset</span>
                <span className="text-xs text-muted-foreground">Vehicle, trailer, generator, equipment</span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              data-testid="quickadd-service"
              disabled={noAssetsConfirmed}
              title={noAssetsConfirmed ? "Add an asset first." : undefined}
              onClick={() => startAssetPick("service")}
            >
              <Wrench className="size-4 mr-3" />
              <span className="flex flex-col items-start">
                <span className="font-medium">Log a service</span>
                <span className="text-xs text-muted-foreground">
                  {noAssetsConfirmed ? "Add an asset first." : "Routine or unscheduled service / repair"}
                </span>
              </span>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-auto py-3"
              data-testid="quickadd-meter"
              disabled={noAssetsConfirmed}
              title={noAssetsConfirmed ? "Add an asset first." : undefined}
              onClick={() => startAssetPick("meter")}
            >
              <Gauge className="size-4 mr-3" />
              <span className="flex flex-col items-start">
                <span className="font-medium">Add a meter reading</span>
                <span className="text-xs text-muted-foreground">
                  {noAssetsConfirmed ? "Add an asset first." : "Mileage, hours, or count"}
                </span>
              </span>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-3" data-testid="quickadd-inventory" onClick={() => go("/inventory/new")}>
              <Boxes className="size-4 mr-3" />
              <span className="flex flex-col items-start">
                <span className="font-medium">Add an inventory item</span>
                <span className="text-xs text-muted-foreground">Oil, filter, fluid, part</span>
              </span>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

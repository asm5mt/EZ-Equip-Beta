import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Truck, Gauge, Wrench, Boxes } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { Asset } from "@shared/schema";
import { useAppContext } from "@/lib/app-context";

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export function QuickAddSheet({ open, onOpenChange }: Props) {
  const [, navigate] = useLocation();
  const { fleet } = useAppContext();
  const assetsQ = useQuery<Asset[]>({
    queryKey: ["/api/assets", { fleetId: fleet?.id }],
    enabled: !!fleet,
  });
  const assets = assetsQ.data ?? [];
  const firstAssetId = assets[0]?.id;

  const go = (path: string) => { onOpenChange(false); navigate(path); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Quick Add</SheetTitle>
          <SheetDescription>Jump to the most common entry points.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 grid grid-cols-1 gap-2">
          <Button variant="outline" className="justify-start h-auto py-3" data-testid="quickadd-asset" onClick={() => go("/assets/new")}>
            <Truck className="size-4 mr-3" />
            <span className="flex flex-col items-start">
              <span className="font-medium">New asset</span>
              <span className="text-xs text-muted-foreground">Vehicle, trailer, generator, equipment</span>
            </span>
          </Button>
          <Button variant="outline" className="justify-start h-auto py-3" data-testid="quickadd-service" onClick={() => firstAssetId && go(`/assets/${firstAssetId}/services/new`)}>
            <Wrench className="size-4 mr-3" />
            <span className="flex flex-col items-start">
              <span className="font-medium">Log a service</span>
              <span className="text-xs text-muted-foreground">Routine or unscheduled service / repair</span>
            </span>
          </Button>
          <Button variant="outline" className="justify-start h-auto py-3" data-testid="quickadd-meter" onClick={() => firstAssetId && go(`/assets/${firstAssetId}/meter/new`)}>
            <Gauge className="size-4 mr-3" />
            <span className="flex flex-col items-start">
              <span className="font-medium">Add a meter reading</span>
              <span className="text-xs text-muted-foreground">Mileage, hours, or count</span>
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
      </SheetContent>
    </Sheet>
  );
}

import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditablePageActions } from "@/components/EditablePageActions";
import { Paperclip, FileText, Image as ImageIcon, Eye, Trash2 } from "lucide-react";
import type { InventoryItem } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatNumber } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useAppContext } from "@/lib/app-context";

const CONTAINERS = [
  { label: "Quart bottle", size: 1, unit: "qt" },
  { label: "5 qt jug", size: 5, unit: "qt" },
  { label: "20 qt box", size: 20, unit: "qt" },
  { label: "Gallon jug", size: 1, unit: "gal" },
  { label: "Liter bottle", size: 1, unit: "l" },
  { label: "Each", size: 1, unit: "each" },
  { label: "Custom", size: 1, unit: "custom" },
];

const FACTOR_TO_QUART: Record<string, number> = {
  qt: 1,
  gal: 4,
  l: 1.05669,
  ml: 0.00105669,
  oz: 0.03125,
};

type PendingAttachment = {
  fileName: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

export default function InventoryStockForm({ itemId }: { itemId: number }) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canEdit } = useAppContext();
  const itemQ = useQuery<InventoryItem>({ queryKey: ["/api/inventory-items", itemId], enabled: !!itemId });

  const [container, setContainer] = useState("5 qt jug");
  const template = CONTAINERS.find(c => c.label === container) ?? CONTAINERS[1];
  const [containerCount, setContainerCount] = useState(1);
  const [containerSize, setContainerSize] = useState(template.size);
  const [containerUnit, setContainerUnit] = useState(template.unit);
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const item = itemQ.data;
  const quantity = useMemo(() => {
    if (!item) return 0;
    const raw = containerCount * containerSize;
    if (item.unit === containerUnit || containerUnit === "each" || item.unit === "each") return raw;
    if (item.unit === "qt" && FACTOR_TO_QUART[containerUnit]) return raw * FACTOR_TO_QUART[containerUnit];
    if (containerUnit === "qt" && FACTOR_TO_QUART[item.unit]) return raw / FACTOR_TO_QUART[item.unit];
    return raw;
  }, [containerCount, containerSize, containerUnit, item]);

  const save = useMutation({
    mutationFn: async () => {
      if (!item) throw new Error("Inventory item not loaded");
      const res = await apiRequest("POST", "/api/inventory-movements", {
        inventoryItemId: item.id,
        movementType: "restock",
        quantity,
        serviceEventId: null,
        occurredAt: new Date().toISOString(),
        notes: notes || `Added ${containerCount} × ${containerSize} ${containerUnit} (${container})`,
      });
      const movement = await res.json();
      for (const attachment of attachments) {
        await apiRequest("POST", "/api/attachments", {
          entityType: "inventory-movement",
          entityId: movement.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          size: attachment.size,
          dataUrl: attachment.dataUrl,
          notes: null,
          createdAt: new Date().toISOString(),
        });
      }
      return movement;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-items", itemId] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory-movements"] });
      toast({ title: "Inventory added" });
      navigate("/inventory");
    },
    onError: (e: any) => toast({ title: "Add failed", description: String(e?.message ?? e), variant: "destructive" }),
  });

  const addAttachments = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await Promise.all(Array.from(files).map(file => new Promise<PendingAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: String(reader.result),
      });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    setAttachments(current => [...current, ...next]);
  };
  const hasChanges = container !== "5 qt jug" || containerCount !== 1 || containerSize !== 5 || containerUnit !== "qt" || notes.trim().length > 0 || attachments.length > 0;
  const goBack = () => navigate("/inventory");

  return (
    <AppShell title={item?.name ?? "Add Inventory"} subtitle="ADD INVENTORY STOCK">
      <div className="max-w-3xl space-y-5">
        <EditablePageActions
          hasChanges={hasChanges}
          isSaving={save.isPending}
          canSave={canEdit && !!item && quantity > 0}
          onBack={goBack}
          onCancel={goBack}
          onSave={() => save.mutate()}
          saveLabel="Save"
          savePendingLabel="Adding…"
        />

        <Card className="p-5 space-y-5">
          {!canEdit && (
            <div className="rounded-md border border-[hsl(var(--status-warn)/0.35)] bg-[hsl(var(--status-warn)/0.08)] p-3 text-sm">
              Viewer access is read-only. Switch to an editor or admin user to add inventory.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Current On Hand</Label>
              <div className="mt-2 rounded-md border border-border p-3 num text-lg font-semibold" data-testid="text-current-stock">
                {formatNumber(item?.onHand, { maximumFractionDigits: 2 })} <span className="text-xs text-muted-foreground">{item?.unit}</span>
              </div>
            </div>
            <div>
              <Label>Calculated Addition</Label>
              <div className="mt-2 rounded-md border border-[hsl(var(--primary)/0.35)] bg-[hsl(var(--primary)/0.08)] p-3 num text-lg font-semibold text-[hsl(var(--primary))]" data-testid="text-calculated-addition">
                {formatNumber(quantity, { maximumFractionDigits: 2 })} <span className="text-xs">{item?.unit}</span>
              </div>
            </div>
            <div>
              <Label>New On Hand</Label>
              <div className="mt-2 rounded-md border border-border p-3 num text-lg font-semibold" data-testid="text-new-stock">
                {formatNumber((item?.onHand ?? 0) + quantity, { maximumFractionDigits: 2 })} <span className="text-xs text-muted-foreground">{item?.unit}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Container</Label>
              <Select value={container} onValueChange={(value) => {
                setContainer(value);
                const next = CONTAINERS.find(c => c.label === value);
                if (next) {
                  setContainerSize(next.size);
                  setContainerUnit(next.unit === "custom" ? (item?.unit ?? "each") : next.unit);
                }
              }}>
                <SelectTrigger data-testid="select-container"><SelectValue /></SelectTrigger>
                <SelectContent>{CONTAINERS.map(c => <SelectItem key={c.label} value={c.label}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Number of Containers</Label>
              <Input type="number" step="0.01" value={containerCount} onChange={e => setContainerCount(Number(e.target.value))} data-testid="input-container-count" />
            </div>
            <div>
              <Label>Container Size</Label>
              <Input type="number" step="0.01" value={containerSize} onChange={e => setContainerSize(Number(e.target.value))} data-testid="input-container-size" />
            </div>
            <div>
              <Label>Container Unit</Label>
              <Select value={containerUnit} onValueChange={setContainerUnit}>
                <SelectTrigger data-testid="select-container-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["each", "qt", "gal", "l", "ml", "oz", "box", "set"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Receiving Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} data-testid="textarea-restock-notes" placeholder="Vendor, receipt number, sale price, storage location…" />
          </div>

          <div className="rounded-md border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <Label>Attachments</Label>
                <p className="text-sm text-muted-foreground mt-1">Stage receipts, photos, packing slips, or PDFs with this inventory add.</p>
              </div>
              <Button type="button" variant="outline" size="sm" asChild data-testid="button-add-restock-attachment">
                <label>
                  <Paperclip className="size-4 mr-1.5" /> Add Files
                  <input
                    className="sr-only"
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv"
                    onChange={e => void addAttachments(e.target.files)}
                    data-testid="input-restock-attachments"
                  />
                </label>
              </Button>
            </div>
            {attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attachments staged.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {attachments.map((attachment, idx) => (
                  <AttachmentPreview
                    key={`${attachment.fileName}-${idx}`}
                    attachment={attachment}
                    onRemove={() => setAttachments(current => current.filter((_, i) => i !== idx))}
                    idx={idx}
                  />
                ))}
              </div>
            )}
          </div>

        </Card>
      </div>
    </AppShell>
  );
}

function AttachmentPreview({ attachment, onRemove, idx }: {
  attachment: PendingAttachment; onRemove: () => void; idx: number;
}) {
  const isImage = attachment.mimeType.startsWith("image/");
  const isPdf = attachment.mimeType === "application/pdf";
  return (
    <div className="rounded-md border border-border p-3 flex items-center gap-3" data-testid={`card-restock-attachment-${idx}`}>
      <div className="size-12 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {isImage ? (
          <img src={attachment.dataUrl} alt={attachment.fileName} className="h-full w-full object-cover" />
        ) : isPdf ? (
          <FileText className="size-5 text-muted-foreground" />
        ) : (
          <ImageIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{attachment.fileName}</div>
        <div className="text-xs text-muted-foreground">{attachment.mimeType || "file"} · {(attachment.size / 1024).toFixed(1)} KB</div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => window.open(attachment.dataUrl, "_blank")} data-testid={`button-view-restock-attachment-${idx}`}>
        <Eye className="size-4" />
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} data-testid={`button-remove-restock-attachment-${idx}`}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

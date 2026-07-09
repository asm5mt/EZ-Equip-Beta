import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Paperclip, FileText, Image as ImageIcon, Eye, Trash2 } from "lucide-react";
import type { Attachment } from "@shared/schema";
import { ALLOWED_ATTACHMENT_MIME_TYPES } from "@shared/schema";
import { downloadAttachment, isImageAttachment, type PendingAttachment, type ViewableAttachment } from "@/lib/attachments";
import { AttachmentImageDialog } from "@/components/AttachmentImageDialog";
import { useToast } from "@/hooks/use-toast";

/**
 * Existing (saved) + staged (pending upload) attachments for one entity.
 * Handles its own "existing attachments" fetch so callers don't need to —
 * pass entityId={undefined} for a not-yet-created record (nothing to fetch).
 */
export function AttachmentsSection({
  entityType,
  entityId,
  readOnly,
  pendingAttachments = [],
  onPendingAttachmentsChange,
  title = "Attachments",
  description = "Attach images, PDFs, receipts, or documents.",
  testId = "attachments",
}: {
  entityType: string;
  entityId?: number;
  readOnly: boolean;
  pendingAttachments?: PendingAttachment[];
  onPendingAttachmentsChange?: (next: PendingAttachment[]) => void;
  title?: string;
  description?: string;
  testId?: string;
}) {
  const { toast } = useToast();
  const [viewingImage, setViewingImage] = useState<ViewableAttachment | null>(null);
  const existingQ = useQuery<Attachment[]>({
    queryKey: ["/api/attachments", { entityType, entityId }],
    enabled: !!entityId,
  });
  const existing = existingQ.data ?? [];

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !onPendingAttachmentsChange) return;
    const allFiles = Array.from(files);
    const allowed = allFiles.filter(f => (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(f.type));
    if (allowed.length < allFiles.length) {
      toast({
        title: "Some files were skipped",
        description: "Only images (JPEG/PNG/GIF/WebP) and PDF files can be attached.",
        variant: "destructive",
      });
    }
    if (!allowed.length) return;
    const next = await Promise.all(allowed.map(file => new Promise<PendingAttachment>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        dataUrl: String(reader.result),
      });
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    })));
    onPendingAttachmentsChange([...pendingAttachments, ...next]);
  };

  const nothingToShow = existing.length === 0 && pendingAttachments.length === 0;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {!readOnly && (
          <Button type="button" variant="outline" size="sm" asChild data-testid={`button-add-${testId}`}>
            <label>
              <Paperclip className="size-4 mr-1.5" /> Add Files
              <input
                className="sr-only"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
                onChange={e => void addFiles(e.target.files)}
                data-testid={`input-${testId}`}
              />
            </label>
          </Button>
        )}
      </div>
      {nothingToShow ? (
        <p className="text-sm text-muted-foreground">
          {readOnly ? "No attachments." : "No attachments staged yet. Files added here are saved with this record."}
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {existing.map(a => (
            <AttachmentCard
              key={`existing-${a.id}`}
              attachment={a}
              testId={`${testId}-existing-${a.id}`}
              onView={() => setViewingImage(a)}
            />
          ))}
          {!readOnly && pendingAttachments.map((a, idx) => (
            <AttachmentCard
              key={`pending-${a.fileName}-${idx}`}
              attachment={a}
              testId={`${testId}-pending-${idx}`}
              onView={() => setViewingImage(a)}
              onRemove={onPendingAttachmentsChange ? () => onPendingAttachmentsChange(pendingAttachments.filter((_, i) => i !== idx)) : undefined}
            />
          ))}
        </div>
      )}
      <AttachmentImageDialog attachment={viewingImage} onOpenChange={open => !open && setViewingImage(null)} />
    </Card>
  );
}

function AttachmentCard({ attachment, onView, onRemove, testId }: {
  attachment: ViewableAttachment & { size?: number };
  onView: () => void;
  onRemove?: () => void;
  testId: string;
}) {
  const isImage = isImageAttachment(attachment);
  const isPdf = attachment.mimeType === "application/pdf";
  return (
    <div className="rounded-md border border-border p-3 flex items-center gap-3" data-testid={`card-${testId}`}>
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
        <div className="text-xs text-muted-foreground">
          {attachment.mimeType || "file"}{attachment.size != null ? ` · ${(attachment.size / 1024).toFixed(1)} KB` : ""}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={() => isImage ? onView() : downloadAttachment(attachment)} data-testid={`button-view-${testId}`}>
        <Eye className="size-4" />
      </Button>
      {onRemove && (
        <Button type="button" variant="ghost" size="sm" onClick={onRemove} data-testid={`button-remove-${testId}`}>
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}

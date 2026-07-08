import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ViewableAttachment } from "@/lib/attachments";

// Full-size image preview only — never navigates to the raw data: URI as a
// top-level document, so a mismatched/spoofed content type can't execute.
export function AttachmentImageDialog({ attachment, onOpenChange }: {
  attachment: ViewableAttachment | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!attachment} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-6">{attachment?.fileName}</DialogTitle>
        </DialogHeader>
        {attachment && (
          <img
            src={attachment.dataUrl}
            alt={attachment.fileName}
            className="max-h-[70vh] w-full rounded-md object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

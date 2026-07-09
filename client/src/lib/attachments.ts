export interface ViewableAttachment {
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

/** A file staged client-side, not yet uploaded — created before the parent record is saved. */
export interface PendingAttachment extends ViewableAttachment {
  size: number;
}

export function isImageAttachment(attachment: Pick<ViewableAttachment, "mimeType">): boolean {
  return attachment.mimeType.startsWith("image/");
}

// Forces a save-as instead of an in-browser open — used for anything that
// isn't rendered through <img>, so a data: URI never gets navigated to as a
// directly-executing document.
export function downloadAttachment(attachment: Pick<ViewableAttachment, "fileName" | "dataUrl">) {
  const a = document.createElement("a");
  a.href = attachment.dataUrl;
  a.download = attachment.fileName;
  a.click();
}

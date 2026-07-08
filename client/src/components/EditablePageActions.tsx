import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowLeft, Save, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PendingAction = (() => void) | null;

export function useUnsavedChangeGuard({
  hasChanges,
  onSave,
}: {
  hasChanges: boolean;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const confirmOrRun = (action: () => void) => {
    if (!hasChanges) {
      action();
      return;
    }
    setPendingAction(() => action);
    setOpen(true);
  };

  const discardAndContinue = () => {
    const action = pendingAction;
    setOpen(false);
    setPendingAction(null);
    action?.();
  };

  const dialog = (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent className="border-[hsl(var(--status-warn)/0.45)] bg-background">
        <AlertDialogHeader>
          <div className="mb-1 inline-flex size-10 items-center justify-center rounded-full status-warn">
            <AlertTriangle className="size-5" />
          </div>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have changes that have not been saved yet. Save them before leaving, discard the changes, or stay on this page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="button-stay-unsaved-dialog">
            Stay
          </Button>
          <Button type="button" variant="cancel" onClick={discardAndContinue} data-testid="button-discard-unsaved-dialog">
            <X className="size-4 mr-1.5" /> Discard
          </Button>
          <Button type="button" variant="success" onClick={() => { onSave(); setOpen(false); }} data-testid="button-save-unsaved-dialog">
            <Save className="size-4 mr-1.5" /> Save
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmOrRun, dialog };
}

export function EditablePageActions({
  hasChanges,
  isSaving,
  canSave,
  onBack,
  onCancel,
  onSave,
  saveLabel = "Save",
  savePendingLabel = "Saving…",
  backLabel = "Back",
  showBack = true,
  label,
  description,
  children,
}: {
  hasChanges: boolean;
  isSaving?: boolean;
  canSave: boolean;
  onBack?: () => void;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  savePendingLabel?: string;
  backLabel?: string;
  showBack?: boolean;
  /** Overrides the badge text shown when hasChanges is true (default "Unsaved changes"). */
  label?: string;
  /** Optional contextual line shown next to the Back button, e.g. "You're editing this work order". */
  description?: string;
  /** Extra content rendered inline next to the Back button, e.g. a page-identity pill. */
  children?: ReactNode;
}) {
  const { confirmOrRun, dialog } = useUnsavedChangeGuard({ hasChanges, onSave });

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {showBack && onBack && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => confirmOrRun(onBack)}
                data-testid="button-back"
              >
                <ArrowLeft className="size-4 mr-1.5" /> {backLabel}
              </Button>
            )}
            {children}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground" data-testid="text-editable-page-description">
              {description}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {hasChanges && (
            <div
              className="rounded-md border px-3 py-1.5 text-[10px] font-semibold tracking-wide status-warn"
              data-testid="badge-unsaved-page-state"
            >
              {label ?? "Unsaved changes"}
            </div>
          )}
          <Button
            type="button"
            variant="cancel"
            onClick={() => confirmOrRun(onCancel)}
            disabled={isSaving}
            data-testid="button-cancel"
          >
            <X className="size-4 mr-1.5" /> Cancel
          </Button>
          <Button
            type="button"
            variant="success"
            onClick={onSave}
            disabled={!canSave || isSaving}
            data-testid="button-save"
          >
            <Save className="size-4 mr-1.5" /> {isSaving ? savePendingLabel : saveLabel}
          </Button>
        </div>
      </div>
      {dialog}
    </>
  );
}

/**
 * Compact icon-only Cancel/Save pair for use inline in a DialogHeader, next
 * to the title, in place of the native corner close button. Pair with a
 * guarded onOpenChange (see useUnsavedChangeGuard's confirmOrRun) so Escape,
 * backdrop click, and this Cancel icon all funnel through the same
 * unsaved-changes warning.
 */
export function DialogHeaderActions({
  onCancel,
  onSave,
  canSave,
  isSaving,
  hasChanges,
  label,
}: {
  onCancel: () => void;
  onSave: () => void;
  canSave: boolean;
  isSaving?: boolean;
  /** Shows the compact "Unsaved changes" badge when true; renders nothing when false. */
  hasChanges?: boolean;
  /** Overrides the badge text shown when hasChanges is true (default "Unsaved changes"). */
  label?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {hasChanges && (
        <div
          className="rounded-md border px-2 py-1 text-[10px] font-semibold tracking-wide status-warn"
          data-testid="badge-unsaved-dialog-state"
        >
          {label ?? "Unsaved changes"}
        </div>
      )}
      <Button
        type="button"
        variant="cancel"
        size="icon"
        className="size-7"
        onClick={onCancel}
        aria-label="Cancel"
        data-testid="button-cancel"
      >
        <X className="size-4" />
      </Button>
      <Button
        type="button"
        variant="success"
        size="icon"
        className="size-7"
        onClick={onSave}
        disabled={!canSave || isSaving}
        aria-label="Save"
        data-testid="button-save"
      >
        <Save className="size-4" />
      </Button>
    </div>
  );
}

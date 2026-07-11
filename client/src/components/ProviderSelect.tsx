import { useRef, useState } from "react";
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface ProviderSelectItem {
  id: number;
  name: string;
}

export interface ProviderSelectProps<T extends ProviderSelectItem> {
  /** "Built-in (<vendor>)" label, always the first row and the value when `value` is null. */
  builtInLabel: string;
  providers: T[];
  value: number | null;
  onValueChange: (id: number | null) => void;
  onAddNew: () => void;
  onEdit: (provider: T) => void;
  onDelete: (provider: T) => void;
  disabled?: boolean;
  "data-testid"?: string;
}

const BUILT_IN_VALUE = "__builtin__";
const ADD_NEW_VALUE = "__add_new__";

/**
 * Dedicated Popover+Command combobox for the Privacy tab's per-category
 * "Active provider" picker. A plain Select can't host per-row edit/delete
 * icons cleanly — SelectItem intercepts pointer events for its own
 * selection/close handling, so nested buttons don't isolate and keyboard/
 * screen-reader semantics break. This follows the same Popover+Command shape
 * as SearchableColumnSelect but stays a separate component: that one is
 * shared by five other features with no need for row-action buttons.
 *
 * No search input — per-category provider lists are short — but focus is
 * moved onto the Command root on open so arrow/Home/End/Enter navigation
 * still works without one (cmdk's key handling lives on that root element
 * and only fires for events that reach it).
 */
export function ProviderSelect<T extends ProviderSelectItem>({
  builtInLabel,
  providers,
  value,
  onValueChange,
  onAddNew,
  onEdit,
  onDelete,
  disabled,
  "data-testid": testId,
}: ProviderSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const commandRef = useRef<HTMLDivElement>(null);

  const selected = providers.find(p => p.id === value);
  const triggerLabel = selected ? selected.name : builtInLabel;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
          data-testid={testId}
        >
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] max-w-[420px] p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          commandRef.current?.focus();
        }}
      >
        <Command ref={commandRef} shouldFilter={false}>
          <CommandList>
            <CommandGroup>
              <CommandItem
                value={BUILT_IN_VALUE}
                onSelect={() => { onValueChange(null); setOpen(false); }}
                className={cn("flex items-center gap-2", value == null && "bg-accent/40")}
                data-testid={testId ? `${testId}-option-builtin` : undefined}
              >
                <Check className={cn("size-4 shrink-0", value == null ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{builtInLabel}</span>
              </CommandItem>
              {providers.map(p => (
                <CommandItem
                  key={p.id}
                  value={String(p.id)}
                  onSelect={() => { onValueChange(p.id); setOpen(false); }}
                  className={cn("flex items-center gap-2", value === p.id && "bg-accent/40")}
                  data-testid={testId ? `${testId}-option-${p.id}` : undefined}
                >
                  <Check className={cn("size-4 shrink-0", value === p.id ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={`Edit ${p.name}`}
                      data-testid={testId ? `${testId}-edit-${p.id}` : undefined}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(p); }}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      aria-label={`Delete ${p.name}`}
                      data-testid={testId ? `${testId}-delete-${p.id}` : undefined}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(p); }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </CommandItem>
              ))}
              <CommandItem
                value={ADD_NEW_VALUE}
                onSelect={() => { setOpen(false); onAddNew(); }}
                className="flex items-center gap-2 text-muted-foreground"
                data-testid={testId ? `${testId}-option-add-new` : undefined}
              >
                <Plus className="size-4 shrink-0" />
                <span>Add new provider…</span>
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

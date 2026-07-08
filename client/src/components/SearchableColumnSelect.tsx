import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SearchableColumnDef<T> {
  key: string;
  label: string;
  get: (item: T) => string;
}

export interface SearchableColumnSelectProps<T> {
  items: T[];
  columns: SearchableColumnDef<T>[];
  getId: (item: T) => string;
  value: string | null | undefined;
  onSelect: (id: string) => void;
  /** Text shown on the trigger button; typically the selected item's display label. */
  triggerLabel: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  "data-testid"?: string;
}

/**
 * Generic searchable Popover+Command combobox with aligned column headers,
 * generalizing the pattern originally built for ServiceForm.tsx's inventory
 * item picker. Each row renders one value per column (desktop) with a
 * stacked "label: value" fallback on narrow viewports.
 */
export function SearchableColumnSelect<T>({
  items,
  columns,
  getId,
  value,
  onSelect,
  triggerLabel,
  placeholder = "Search…",
  searchPlaceholder,
  emptyText = "No matches.",
  disabled,
  className,
  contentClassName,
  "data-testid": testId,
}: SearchableColumnSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = items.filter(item => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    const haystack = columns.map(col => col.get(item)).join(" ").toLowerCase();
    return haystack.includes(term);
  });

  return (
    <Popover open={open} onOpenChange={next => { setOpen(next); if (!next) setSearch(""); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
          data-testid={testId}
        >
          <span className="truncate">{triggerLabel || placeholder}</span>
          <ChevronsUpDown className="size-4 opacity-50 shrink-0 ml-2" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[calc(100vw-2rem)] max-w-[420px] p-0", contentClassName)} align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder ?? placeholder}
            value={search}
            onValueChange={setSearch}
            data-testid={testId ? `${testId}-search` : undefined}
          />
          <CommandList>
            <div
              className="hidden sm:grid gap-2 px-2 pb-1 pt-2 text-[10px] uppercase tracking-wide text-muted-foreground"
              style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` }}
            >
              {columns.map(col => <div key={col.key} className="truncate">{col.label}</div>)}
            </div>
            <CommandGroup>
              {filtered.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {search.trim() ? `${emptyText} ("${search.trim()}")` : emptyText}
                </div>
              )}
              {filtered.map(item => {
                const id = getId(item);
                return (
                  <CommandItem
                    key={id}
                    value={id}
                    onSelect={() => { onSelect(id); setOpen(false); setSearch(""); }}
                    className={cn("flex items-center gap-2", id === value && "bg-accent/40")}
                    data-testid={testId ? `${testId}-option-${id}` : undefined}
                  >
                    <div className="hidden flex-1 min-w-0 sm:grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0,1fr))` }}>
                      {columns.map(col => (
                        <span key={col.key} className="truncate">{col.get(item)}</span>
                      ))}
                    </div>
                    <div className="min-w-0 flex-1 sm:hidden">
                      <div className="truncate text-sm font-medium">{columns[0]?.get(item)}</div>
                      {columns.length > 1 && (
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                          {columns.slice(1).map(col => (
                            <span key={col.key} className="max-w-full truncate">
                              <span className="text-muted-foreground/70">{col.label}:</span> {col.get(item)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

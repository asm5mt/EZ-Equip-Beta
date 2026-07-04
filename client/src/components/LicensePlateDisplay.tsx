import { plateBadgeStyle, plateJurisdictionLabel, plateJurisdictionShort } from "@/lib/plates";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

export function LicensePlateDisplay({
  jurisdiction,
  plateNumber,
  compact = false,
}: {
  jurisdiction?: string | null;
  plateNumber?: string | null;
  compact?: boolean;
}) {
  if (!plateNumber) return null;
  const short = plateJurisdictionShort(jurisdiction);
  const label = plateJurisdictionLabel(jurisdiction);
  const style = plateBadgeStyle(jurisdiction);
  const { toast } = useToast();
  const copyPlateNumber = async () => {
    try {
      await navigator.clipboard.writeText(plateNumber);
      toast({ title: "Plate number copied" });
    } catch {
      toast({ title: "Could not copy plate number", variant: "destructive" });
    }
  };
  return (
    <div className="flex items-center gap-3 min-w-0" data-testid="display-license-plate">
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Plate</div>
        <div className="group/plate-number flex items-center gap-1.5">
          <div className="font-mono text-sm font-bold tracking-[0.16em] uppercase leading-tight" data-testid="text-plate-number">
            {plateNumber}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 opacity-0 transition-opacity group-hover/plate-number:opacity-100 focus:opacity-100"
            onClick={copyPlateNumber}
            aria-label="Copy plate number"
            data-testid="button-copy-plate-number"
          >
            <Copy className="size-3" />
          </Button>
        </div>
        {label && (
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground leading-none" data-testid="text-plate-jurisdiction">
            {label}
          </div>
        )}
      </div>
      <PlateBadge short={short} style={style} compact={compact} />
    </div>
  );
}

function PlateBadge({
  short,
  style,
  compact,
}: {
  short: string;
  style: ReturnType<typeof plateBadgeStyle>;
  compact?: boolean;
}) {
  const width = compact ? 60 : 70;
  const height = compact ? 34 : 40;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 70 40"
      role="img"
      aria-label=""
      aria-hidden="true"
      focusable="false"
      className="shrink-0 rounded-[5px] shadow-sm"
      data-testid="svg-plate-badge"
    >
      <rect x="0.75" y="0.75" width="68.5" height="38.5" rx="5" fill={style.background} stroke="rgba(15,23,42,0.28)" strokeWidth="1.5" />
      <rect x="1.5" y="1.5" width="67" height="9" rx="3.8" fill={style.band} />
      {style.accent && <path d="M2.5 32 C17 23, 33 42, 67 27 L67 39 L2.5 39 Z" fill={style.accent} opacity="0.35" />}
      <circle cx="8.5" cy="20.5" r="1.5" fill={style.text} opacity="0.28" />
      <circle cx="61.5" cy="20.5" r="1.5" fill={style.text} opacity="0.28" />
      <text
        x="35"
        y="27"
        textAnchor="middle"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        fontSize="11"
        fontWeight="800"
        letterSpacing="1.4"
        fill={style.text}
      >
        {short}
      </text>
    </svg>
  );
}

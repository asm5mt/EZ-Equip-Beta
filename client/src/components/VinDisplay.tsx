import { cn } from "@/lib/utils";

// Splits the VIN so the last 8 characters (the vehicle-specific serial
// portion) stand out visually from the first 9 (WMI + VDS, shared across
// many vehicles and less useful for at-a-glance identification).
const TAIL_LENGTH = 8;

export function VinDisplay({ vin, className, testId }: { vin: string; className?: string; testId?: string }) {
  if (!vin) return null;
  const splitIndex = Math.max(0, vin.length - TAIL_LENGTH);
  const head = vin.slice(0, splitIndex);
  const tail = vin.slice(splitIndex);
  return (
    <span className={cn("font-mono", className)} data-testid={testId}>
      {head}
      <span className="rounded bg-primary/15 px-1 py-0.5 font-bold text-primary">{tail}</span>
    </span>
  );
}

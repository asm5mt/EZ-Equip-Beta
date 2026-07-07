// EZ-EQUIP logo mark — a minimal "EQ" monogram framed by a pulse-meter chevron.
// Geometric, monochromatic, currentColor-driven, scales from 16px to 200px.

interface LogoProps {
  size?: number;
  withWordmark?: boolean;
  trademark?: boolean;
  className?: string;
}

export function Logo({ size = 28, withWordmark = true, trademark = false, className = "" }: LogoProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid="logo-ez-equip">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-label="EZ-EQUIP"
        className="text-[hsl(var(--sidebar-primary))]"
      >
        <rect x="2" y="2" width="28" height="28" rx="6" stroke="currentColor" strokeWidth="2" />
        {/* meter / pulse line */}
        <path
          d="M6 20 L11 20 L13.5 14 L17 24 L19.5 18 L26 18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {withWordmark && (
        <span className="text-[15px] font-semibold tracking-[0.16em] text-[hsl(var(--sidebar-primary))]">
          EZ-EQUIP
          {trademark && <sup className="ml-0.5 text-[9px] font-medium tracking-normal">™</sup>}
        </span>
      )}
    </div>
  );
}

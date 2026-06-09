import { cn } from "@/lib/utils";

interface LoaderProps {
  className?: string;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "primary" | "secondary" | "white";
}

const sizes = {
  sm: "h-5 w-5",
  md: "h-10 w-10",
  lg: "h-16 w-16",
  xl: "h-24 w-24",
};

const strokeWidths = {
  sm: 4,
  md: 3.5,
  lg: 3,
  xl: 2.5,
};

const tracks = {
  primary: "stroke-stone-200/80",
  secondary: "stroke-stone-200/60",
  white: "stroke-white/20",
};

const indicators = {
  primary: "stroke-amber-600",
  secondary: "stroke-stone-800",
  white: "stroke-white",
};

export function Loader({
  className,
  size = "md",
  variant = "primary",
}: LoaderProps) {
  const r = 13.5;
  const c = 2 * Math.PI * r; // ~84.82
  const dashArray = c.toFixed(2);
  const dashOffset = (c * 0.75).toFixed(2); // Spans exactly 25% of the circle

  return (
    <svg
      className={cn("animate-spin", sizes[size], className)}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Background Track Circle */}
      <circle
        cx="16"
        cy="16"
        r={r}
        className={cn("fill-none", tracks[variant])}
        strokeWidth={strokeWidths[size]}
      />
      {/* Active Spinning Arc */}
      <circle
        cx="16"
        cy="16"
        r={r}
        className={cn("fill-none", indicators[variant])}
        strokeWidth={strokeWidths[size]}
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
      />
    </svg>
  );
}

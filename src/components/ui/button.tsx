import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";
import { Tooltip } from "./tooltip";
import { Loader } from "./loader";

type Variant = "primary" | "secondary" | "danger" | "ghost" | "outline";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  tooltip?: string;
  tooltipPosition?: "top" | "bottom" | "left" | "right";
}

const variants: Record<Variant, string> = {
  primary:
    "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-500",
  secondary:
    "bg-stone-800 text-white hover:bg-stone-900 focus-visible:ring-stone-500",
  danger: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  ghost: "bg-transparent text-stone-700 hover:bg-stone-100",
  outline:
    "border border-stone-300 bg-white text-stone-800 hover:bg-stone-50",
};

const sizes = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading,
      disabled,
      children,
      tooltip,
      tooltipPosition = "top",
      ...props
    },
    ref
  ) => {
    const buttonElement = (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {loading && (
          <Loader
            size="sm"
            variant={variant === "ghost" || variant === "outline" ? "secondary" : "white"}
          />
        )}
        {children}
      </button>
    );

    if (tooltip) {
      return (
        <Tooltip content={tooltip} position={tooltipPosition}>
          {buttonElement}
        </Tooltip>
      );
    }

    return buttonElement;
  }
);
Button.displayName = "Button";

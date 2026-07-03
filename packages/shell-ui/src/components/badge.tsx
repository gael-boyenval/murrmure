import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertCircle,
  Check,
  Clock,
  Hand,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils.js";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-muted text-foreground",
        outline: "text-foreground",
        success: "border-green-800 bg-green-950 text-green-300",
        warning: "border-amber-800 bg-amber-950 text-amber-300",
        running: "border-amber-800 bg-amber-950 text-amber-300",
        failed: "border-red-800 bg-red-950 text-red-300",
        gate: "border-blue-700 bg-blue-950 text-blue-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const defaultVariantIcons: Partial<
  Record<NonNullable<VariantProps<typeof badgeVariants>["variant"]>, LucideIcon>
> = {
  success: Check,
  warning: Clock,
  running: Loader2,
  failed: AlertCircle,
  gate: Hand,
};

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** When true (default for status variants), renders the variant's status icon. */
  showStatusIcon?: boolean;
}

export function Badge({
  className,
  variant,
  showStatusIcon = variant === "success" ||
    variant === "warning" ||
    variant === "running" ||
    variant === "failed" ||
    variant === "gate",
  children,
  ...props
}: BadgeProps) {
  const Icon = variant ? defaultVariantIcons[variant] : undefined;
  const iconSpin = variant === "running";

  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {showStatusIcon && Icon ? (
        <Icon className={cn("h-3 w-3 shrink-0", iconSpin && "animate-spin")} aria-hidden="true" />
      ) : null}
      {children}
    </div>
  );
}

export { badgeVariants };

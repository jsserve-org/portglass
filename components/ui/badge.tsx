import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "border-signal/25 bg-signal/10 text-signal",
        beam: "border-beam/25 bg-beam/10 text-beam",
        amber: "border-amber/25 bg-amber/10 text-amber",
        slate: "border-input bg-muted-foreground/10 text-muted-foreground",
        outline: "border-input text-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

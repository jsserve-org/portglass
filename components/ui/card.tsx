import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-sm border border-border bg-card text-card-foreground",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 border-b border-border bg-muted px-3.5 py-2.5",
        className
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[1.4px] text-muted-foreground [&_svg]:size-3 [&_svg]:text-signal",
        className
      )}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-3.5", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardContent };

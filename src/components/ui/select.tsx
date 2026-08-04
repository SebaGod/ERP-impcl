import * as React from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        // 16px en el teléfono: bajo eso, iOS hace zoom al enfocar y no
        // lo deshace. Ver input.tsx.
        "h-10 w-full appearance-none rounded-lg border border-border bg-card px-3 text-base md:text-sm",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

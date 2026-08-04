import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        // 16px en el teléfono: bajo eso, iOS hace zoom al enfocar y no
        // lo deshace. Ver input.tsx.
        "min-h-20 w-full rounded-lg border border-border bg-card px-3 py-2 text-base md:text-sm",
        "placeholder:text-muted-foreground",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

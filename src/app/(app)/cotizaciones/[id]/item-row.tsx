"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { removeQuoteItem } from "../actions";

export function RemoveItemButton({
  itemId,
  quoteId,
}: {
  itemId: string;
  quoteId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await removeQuoteItem(itemId, quoteId);
        })
      }
      disabled={isPending}
      title="Quitar ítem"
      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );
}

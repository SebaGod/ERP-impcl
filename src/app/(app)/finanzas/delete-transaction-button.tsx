"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteTransaction } from "./actions";

export function DeleteTransactionButton({ txnId }: { txnId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteTransaction(txnId);
        })
      }
      disabled={isPending}
      title="Eliminar movimiento"
      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deletePurchaseOrder,
  removePurchaseOrderItem,
  setPurchaseOrderStatus,
} from "../../actions";
import type { PoStatus } from "../po-status";

export function RemovePoItemButton({
  poItemId,
  poId,
}: {
  poItemId: string;
  poId: string;
}) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await removePurchaseOrderItem(poItemId, poId);
        })
      }
      disabled={isPending}
      title="Quitar"
      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );
}

export function PoActions({
  poId,
  status,
}: {
  poId: string;
  status: PoStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {status === "borrador" && (
        <Button
          disabled={isPending}
          onClick={() => run(() => setPurchaseOrderStatus(poId, "enviada"))}
        >
          <Send className="size-4" /> Marcar como enviada
        </Button>
      )}

      {status !== "recibida" && (
        <Button
          disabled={isPending}
          onClick={() => {
            if (
              !window.confirm(
                "Al recibir la orden se sumará el stock de cada insumo. ¿Continuar?"
              )
            )
              return;
            run(() => setPurchaseOrderStatus(poId, "recibida"));
          }}
        >
          <CheckCircle2 className="size-4" /> Recibir y sumar stock
        </Button>
      )}

      {status === "recibida" && (
        <p className="text-sm font-medium text-success">
          ✓ Recibida. El stock ya fue actualizado.
        </p>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {status !== "recibida" && (
        <div className="border-t border-border pt-3">
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("¿Eliminar esta orden de compra?")) return;
              run(() => deletePurchaseOrder(poId));
            }}
          >
            <Trash2 className="size-4" /> Eliminar
          </Button>
        </div>
      )}
    </div>
  );
}

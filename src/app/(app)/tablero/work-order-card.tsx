"use client";

import Link from "next/link";
import { useTransition } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatMonto,
  formatFecha,
  hoyISO,
  type ConfigRegional,
} from "@/lib/locale";
import { moveWorkOrder } from "./actions";

export interface WorkOrderCardProps {
  id: string;
  code: string;
  title: string;
  clientName: string;
  dueDate: string | null;
  /** null = oculto (operario no ve precios) */
  amountNet: number | null;
  assignedName: string | null;
  completed: boolean;
  prevStageId: string | null;
  nextStageId: string | null;
  /** Moneda y zona horaria de la subcuenta: la sesión no se lee del cliente */
  region: ConfigRegional;
}

export function WorkOrderCard({
  id,
  code,
  title,
  clientName,
  dueDate,
  amountNet,
  assignedName,
  completed,
  prevStageId,
  nextStageId,
  region,
}: WorkOrderCardProps) {
  const [isPending, startTransition] = useTransition();

  // "Atrasada" y "vence hoy" se miden contra el día del negocio, no contra el
  // del navegador de quien mira: un operario de viaje ve las mismas fechas.
  const today = hoyISO(region);
  const overdue = !completed && dueDate !== null && dueDate < today;
  const dueToday = !completed && dueDate === today;

  function move(toStageId: string) {
    startTransition(async () => {
      await moveWorkOrder(id, toStageId);
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card shadow-sm transition-opacity",
        isPending && "opacity-50"
      )}
    >
      <Link href={`/tablero/${id}`} className="block p-3 hover:bg-muted/50">
        <p className="text-xs font-medium text-muted-foreground">{code}</p>
        <p className="mt-0.5 text-sm font-medium leading-snug">{title}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {clientName}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                overdue
                  ? "font-medium text-destructive"
                  : dueToday
                    ? "font-medium text-warning"
                    : "text-muted-foreground"
              )}
            >
              <CalendarDays className="size-3.5" />
              {formatFecha(dueDate, region)}
              {overdue && " (atrasada)"}
            </span>
          )}
          {amountNet !== null && (
            <span className="ml-auto text-xs font-medium">
              {formatMonto(amountNet, region)}
            </span>
          )}
        </div>
      </Link>
      <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
        <button
          onClick={() => prevStageId && move(prevStageId)}
          disabled={!prevStageId || isPending}
          title="Mover a la etapa anterior"
          aria-label="Mover a la etapa anterior"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
        >
          <ChevronLeft className="size-4" />
        </button>
        {assignedName ? (
          <span
            title={`Responsable: ${assignedName}`}
            className="flex size-5.5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary"
          >
            {assignedName.charAt(0).toUpperCase()}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">
            Sin responsable
          </span>
        )}
        <button
          onClick={() => nextStageId && move(nextStageId)}
          disabled={!nextStageId || isPending}
          title="Mover a la etapa siguiente"
          aria-label="Mover a la etapa siguiente"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

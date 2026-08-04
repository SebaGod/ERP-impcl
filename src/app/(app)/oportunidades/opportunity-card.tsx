"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonto, type ConfigRegional } from "@/lib/locale";
import {
  moveOpportunity,
  setOpportunityStatus,
} from "./actions";

export interface OpportunityCardProps {
  id: string;
  title: string;
  contactId: string;
  contactName: string;
  value: number;
  /**
   * Moneda e idioma de la subcuenta: el valor de la oportunidad es plata
   * que vende el CLIENTE. Baja como prop porque este componente corre en
   * el navegador, donde no hay sesión que consultar.
   */
  region: ConfigRegional;
  prevStageId: string | null;
  nextStageId: string | null;
  /**
   * Aviso al padre cuando el servidor confirmó un cambio (mover etapa,
   * ganar/perder). El refresh solo repinta las primeras páginas que trajo
   * el servidor; si esta tarjeta venía de un "cargar más", la columna debe
   * sacarla de su lista local o quedaría fantasma.
   */
  alMutar?: (id: string) => void;
}

export function OpportunityCard({
  id,
  title,
  contactId,
  contactName,
  value,
  region,
  prevStageId,
  nextStageId,
  alMutar,
}: OpportunityCardProps) {
  const [isPending, startTransition] = useTransition();

  function move(stageId: string) {
    startTransition(async () => {
      const res = await moveOpportunity(id, stageId);
      // Solo si el servidor confirmó: si falló, la tarjeta debe seguir
      // visible donde estaba.
      if (!res.error) alMutar?.(id);
    });
  }
  function setStatus(status: "ganada" | "perdida") {
    startTransition(async () => {
      const res = await setOpportunityStatus(id, status);
      if (!res.error) alMutar?.(id);
    });
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card shadow-sm transition-opacity",
        isPending && "opacity-50"
      )}
    >
      <div className="p-3">
        <p className="text-sm font-medium leading-snug">{title}</p>
        <Link
          href={`/contactos/${contactId}`}
          className="mt-0.5 block truncate text-xs text-primary hover:underline"
        >
          {contactName}
        </Link>
        {value > 0 && (
          <p className="mt-1 text-xs font-medium">
            {formatMonto(value, region)}
          </p>
        )}
      </div>
      <div className="flex items-center justify-between border-t border-border px-1.5 py-1">
        <button
          onClick={() => prevStageId && move(prevStageId)}
          disabled={!prevStageId || isPending}
          title="Etapa anterior"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
        >
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setStatus("ganada")}
            disabled={isPending}
            title="Marcar ganada"
            className="rounded p-1 text-muted-foreground hover:bg-success/10 hover:text-success disabled:opacity-50"
          >
            <Check className="size-3.5" />
          </button>
          <button
            onClick={() => setStatus("perdida")}
            disabled={isPending}
            title="Marcar perdida"
            className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <button
          onClick={() => nextStageId && move(nextStageId)}
          disabled={!nextStageId || isPending}
          title="Etapa siguiente"
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:invisible"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCLP } from "@/lib/format";
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
  prevStageId: string | null;
  nextStageId: string | null;
}

export function OpportunityCard({
  id,
  title,
  contactId,
  contactName,
  value,
  prevStageId,
  nextStageId,
}: OpportunityCardProps) {
  const [isPending, startTransition] = useTransition();

  function move(stageId: string) {
    startTransition(async () => {
      await moveOpportunity(id, stageId);
    });
  }
  function setStatus(status: "ganada" | "perdida") {
    startTransition(async () => {
      await setOpportunityStatus(id, status);
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
          <p className="mt-1 text-xs font-medium">{formatCLP(value)}</p>
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

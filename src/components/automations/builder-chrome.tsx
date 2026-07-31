"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  alternarAutomatizacion,
  eliminarAutomatizacion,
} from "@/lib/automation/actions";

/**
 * Cabecera del lienzo: volver al listado, nombre editable en línea, estado de
 * publicación y guardado. Es la franja fija que enmarca el constructor.
 */
export function BuilderChrome({
  automationId,
  nombreInicial,
  activa,
  guardado,
  pendiente,
}: {
  /** Nulo mientras la automatización no existe (pantalla de creación) */
  automationId: string | null;
  nombreInicial: string;
  activa: boolean;
  /** true cuando no hay cambios sin guardar */
  guardado: boolean;
  pendiente: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card px-3 py-2">
      <Link
        href="/automatizaciones"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Automatizaciones
      </Link>

      <div className="mx-auto flex min-w-0 items-center gap-2">
        <input
          name="name"
          defaultValue={nombreInicial}
          placeholder="Automatización sin nombre"
          required
          className="min-w-0 truncate rounded-lg border border-transparent bg-transparent px-2 py-1 text-center text-sm font-semibold outline-none transition-colors duration-150 hover:border-border focus:border-primary focus:bg-background"
        />
      </div>

      <div className="flex items-center gap-2">
        <span
          className={cn(
            "hidden items-center gap-1.5 text-xs sm:flex",
            guardado ? "text-muted-foreground" : "text-warning"
          )}
        >
          {pendiente ? (
            <>
              <Loader2 className="size-3.5 animate-spin" /> Guardando…
            </>
          ) : guardado ? (
            <>
              <Check className="size-3.5" /> Guardado
            </>
          ) : (
            "Cambios sin guardar"
          )}
        </span>

        {automationId && (
          <>
            <EstadoPublicacion id={automationId} activa={activa} />
            <button
              type="button"
              title="Eliminar automatización"
              disabled={isPending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Se eliminará esta automatización y su historial. ¿Continuar?"
                  )
                ) {
                  return;
                }
                startTransition(async () => {
                  await eliminarAutomatizacion(automationId);
                });
              }}
              className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </button>
          </>
        )}

        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </header>
  );
}

/**
 * Interruptor borrador / publicado. Publicar es lo que hace que la
 * automatización empiece a correr, así que se muestra explícito y no
 * escondido en un menú.
 */
function EstadoPublicacion({ id, activa }: { id: string; activa: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [publicada, setPublicada] = useState(activa);

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border px-2 py-1">
      <span
        className={cn(
          "text-xs font-medium",
          publicada ? "text-muted-foreground" : "text-foreground"
        )}
      >
        Borrador
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={publicada}
        aria-label={publicada ? "Pasar a borrador" : "Publicar"}
        disabled={isPending}
        onClick={() => {
          const siguiente = !publicada;
          setPublicada(siguiente);
          startTransition(async () => {
            await alternarAutomatizacion(id, siguiente);
          });
        }}
        className={cn(
          "relative h-4.5 w-8 shrink-0 rounded-full transition-colors duration-150",
          publicada ? "bg-success" : "bg-muted-foreground/30"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-3.5 rounded-full bg-white shadow transition-all duration-150",
            publicada ? "left-4" : "left-0.5"
          )}
        />
      </button>
      <span
        className={cn(
          "text-xs font-medium",
          publicada ? "text-success" : "text-muted-foreground"
        )}
      >
        Publicar
      </span>
    </div>
  );
}

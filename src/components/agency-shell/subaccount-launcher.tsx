"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Building2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgSummary } from "@/lib/auth";
import { switchOrg } from "@/app/agencia/actions";

interface SubaccountLauncherProps {
  orgs: OrgSummary[];
}

/**
 * Lanzador de subcuentas.
 *
 * Antes este control decía "Volver a <cliente>", lo que dejaba al panel
 * de agencia como si fuera una desviación desde la cuenta del cliente.
 * Es al revés: la agencia es el nivel de arriba y desde aquí se ENTRA a
 * una subcuenta. El texto y la flecha ahora dicen eso.
 */
export function SubaccountLauncher({ orgs }: SubaccountLauncherProps) {
  const [open, setOpen] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [entrando, setEntrando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const contenedor = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setBusqueda("");
      return;
    }
    campo.current?.focus();

    function alPresionar(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function alHacerClic(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", alPresionar);
    document.addEventListener("mousedown", alHacerClic);
    return () => {
      document.removeEventListener("keydown", alPresionar);
      document.removeEventListener("mousedown", alHacerClic);
    };
  }, [open]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((o) => o.name.toLowerCase().includes(q));
  }, [orgs, busqueda]);

  function entrar(orgId: string) {
    setEntrando(orgId);
    startTransition(async () => {
      await switchOrg(orgId);
    });
  }

  if (orgs.length === 0) return null;

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 rounded-lg border border-tower-border bg-tower-elevated px-3 py-2 text-[13px] font-medium text-tower-foreground transition-colors",
          "hover:border-tower-accent/60 hover:bg-tower-border disabled:opacity-60"
        )}
      >
        <Building2 className="size-4 shrink-0 text-tower-muted" />
        <span className="hidden sm:inline">
          {isPending ? "Entrando…" : "Entrar a una subcuenta"}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-tower-muted" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          {orgs.length > 6 && (
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={campo}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cliente…"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          )}

          <div className="max-h-80 overflow-y-auto p-1">
            {filtradas.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                Ningún cliente coincide.
              </p>
            ) : (
              filtradas.map((org) => (
                <button
                  key={org.id}
                  type="button"
                  role="menuitem"
                  onClick={() => entrar(org.id)}
                  disabled={isPending}
                  className="group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
                    {org.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="min-w-0 flex-1 truncate">{org.name}</span>
                  {entrando === org.id && isPending ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Entrando…
                    </span>
                  ) : (
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

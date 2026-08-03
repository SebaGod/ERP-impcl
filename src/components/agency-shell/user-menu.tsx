"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogOut, Settings, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface UserMenuProps {
  userName: string;
  userEmail: string;
  agencyName: string;
  /** "owner" da acceso a los ajustes de la agencia */
  agencyRole: "owner" | "admin";
  /** Sobre fondo oscuro (barra de la torre) o claro */
  tone?: "oscuro" | "claro";
}

/**
 * Menú de la persona conectada, arriba a la derecha.
 *
 * Vive en la esquina porque ahí lo busca todo el mundo por costumbre, y
 * porque en el panel de agencia el pie de la barra lateral ya está
 * ocupado por el lanzador de subcuentas.
 */
export function UserMenu({
  userName,
  userEmail,
  agencyName,
  agencyRole,
  tone = "oscuro",
}: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  // Cerrar con Escape o al hacer clic fuera: un menú que se queda abierto
  // tapando la página es más molesto que útil.
  useEffect(() => {
    if (!open) return;

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

  async function cerrarSesion() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inicial = (userName || userEmail || "?").charAt(0).toUpperCase();
  const oscuro = tone === "oscuro";

  return (
    <div className="relative" ref={contenedor}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tu cuenta"
        className={cn(
          "flex size-9 items-center justify-center rounded-full text-sm font-semibold transition-colors",
          oscuro
            ? "bg-tower-elevated text-tower-foreground ring-1 ring-tower-border hover:bg-tower-border"
            : "bg-primary/10 text-primary hover:bg-primary/15",
          open && (oscuro ? "ring-tower-accent" : "ring-2 ring-primary/30")
        )}
      >
        {inicial}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
        >
          <div className="border-b border-border px-3 py-3">
            <p className="truncate text-sm font-semibold">
              {userName || "Sin nombre"}
            </p>
            <p className="truncate text-xs text-muted-foreground">{userEmail}</p>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 text-primary" />
              <span className="truncate">
                {agencyRole === "owner" ? "Dueño" : "Administrador"} de{" "}
                {agencyName}
              </span>
            </p>
          </div>

          <div className="p-1">
            <Link
              href="/agencia/equipo"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Users className="size-4 shrink-0" />
              Equipo de la agencia
            </Link>
            <Link
              href="/agencia/configuracion"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Settings className="size-4 shrink-0" />
              Configuración
            </Link>
          </div>

          <div className="border-t border-border p-1">
            <button
              type="button"
              role="menuitem"
              onClick={cerrarSesion}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="size-4 shrink-0" />
              Cerrar sesión
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

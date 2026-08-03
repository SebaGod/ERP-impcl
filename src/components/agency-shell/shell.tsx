"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgSummary } from "@/lib/auth";
import { agencyNav, itemActivo, type AgencyBadges } from "./nav";
import { SubaccountLauncher } from "./subaccount-launcher";
import { UserMenu } from "./user-menu";

interface AgencyShellProps {
  agencyName: string;
  agencyRole: "owner" | "admin";
  userName: string;
  userEmail: string;
  orgs: OrgSummary[];
  subcuentas: number;
  badges: AgencyBadges;
  children: React.ReactNode;
}

/**
 * Chasis del panel de agencia.
 *
 * Barra lateral oscura y fija: es el nivel superior del producto, no una
 * pestaña colgada de una subcuenta. Todo lo que se navega desde aquí
 * atraviesa la cartera completa; para trabajar dentro de un cliente se
 * entra a su subcuenta desde el lanzador de la barra superior.
 */
export function AgencyShell({
  agencyName,
  agencyRole,
  userName,
  userEmail,
  orgs,
  subcuentas,
  badges,
  children,
}: AgencyShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const tituloActual =
    agencyNav
      .flatMap((s) => s.items)
      // El más específico gana: /agencia/consola antes que /agencia
      .sort((a, b) => b.href.length - a.href.length)
      .find((item) => itemActivo(item, pathname))?.label ?? "Panel de agencia";

  const marca = (
    <Link
      href="/agencia"
      onClick={() => setMobileOpen(false)}
      className="flex items-center gap-2.5 border-b border-tower-border px-4 py-3.5"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tower-accent text-sm font-bold text-white">
        {agencyName.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-tower-foreground">
          {agencyName}
        </p>
        <p className="truncate text-[11px] text-tower-muted">
          {subcuentas === 1 ? "1 subcuenta" : `${subcuentas} subcuentas`}
        </p>
      </div>
    </Link>
  );

  const nav = (
    <nav className="scrollbar-thin flex flex-1 flex-col gap-5 overflow-y-auto p-3">
      {agencyNav.map((section, i) => (
        <div key={section.label ?? `principal-${i}`} className="flex flex-col gap-0.5">
          {section.label && (
            <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-tower-muted/70">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const active = itemActivo(item, pathname);
            const pendientes = item.badge ? (badges[item.badge] ?? 0) : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-item group relative flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-150",
                  active
                    ? "bg-tower-accent/15 font-semibold text-white"
                    : "font-medium text-tower-muted hover:bg-tower-elevated hover:text-tower-foreground"
                )}
              >
                {/* Marca de la sección activa: una barra a la izquierda, no
                    un cambio de fondo a secas. Se ve de reojo. */}
                <span
                  className={cn(
                    "absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-tower-accent transition-opacity",
                    active ? "opacity-100" : "opacity-0"
                  )}
                />
                <item.icon
                  className={cn(
                    "size-4 shrink-0 transition-colors",
                    active ? "text-tower-accent" : "group-hover:text-tower-accent"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                {pendientes > 0 && (
                  <span
                    title={`${pendientes} ${pendientes === 1 ? "requiere" : "requieren"} atención`}
                    className="flex min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-bold tabular-nums text-white"
                  >
                    {pendientes}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const pie = (
    <div className="border-t border-tower-border px-4 py-3">
      <p className="text-[11px] leading-relaxed text-tower-muted">
        Estás en el nivel de agencia: todo lo que ves aquí cruza a todos tus
        clientes.
      </p>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full bg-muted/40">
      {/* Barra lateral de escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-tower md:flex">
        {marca}
        {nav}
        {pie}
      </aside>

      {/* Cajón móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-tower shadow-2xl">
            <div className="flex items-center">
              <div className="min-w-0 flex-1">{marca}</div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Cerrar menú"
                className="mr-2 shrink-0 rounded-lg p-2 text-tower-muted hover:bg-tower-elevated hover:text-tower-foreground"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {pie}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-tower-border bg-tower px-4 py-2.5">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="rounded-lg p-2 text-tower-muted hover:bg-tower-elevated hover:text-tower-foreground md:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-tower-foreground">
              {tituloActual}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SubaccountLauncher orgs={orgs} />
            <UserMenu
              userName={userName}
              userEmail={userEmail}
              agencyName={agencyName}
              agencyRole={agencyRole}
            />
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

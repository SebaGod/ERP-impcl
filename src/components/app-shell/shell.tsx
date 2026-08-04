"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { OrgRole, OrgSummary } from "@/lib/auth";
import type { ModuleKey } from "@/lib/auth/permissions";
import { navSections } from "./nav";
import { OrgSwitcher } from "./org-switcher";

interface ShellProps {
  orgName: string;
  orgId: string;
  orgs: OrgSummary[];
  agencyName: string | null;
  userName: string;
  userEmail: string;
  role: OrgRole;
  roleLabel?: string | null;
  permisos: ModuleKey[];
  children: React.ReactNode;
}

const roleLabels: Record<OrgRole, string> = {
  admin: "Administrador",
  operario: "Operario",
};

export function Shell({
  orgName,
  orgId,
  orgs,
  agencyName,
  userName,
  userEmail,
  role,
  roleLabel,
  permisos,
  children,
}: ShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections = navSections(permisos);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="scrollbar-thin flex flex-1 flex-col gap-4 overflow-y-auto p-3">
      {sections.map((section, i) => (
        <div key={section.group} className="flex flex-col gap-1">
          {/* La primera sección no lleva encabezado: es la principal */}
          {i > 0 && (
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section.label}
            </p>
          )}
          {section.items.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  // Más alto en el teléfono. Este mismo bloque se usa en
                  // la barra lateral del escritorio y en el cajón del
                  // móvil: con el ratón, 30px de alto se aciertan siempre;
                  // con el pulgar, no. Como el cajón solo existe bajo md y
                  // la barra solo sobre md, basta la clase responsiva.
                  "nav-item flex items-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium transition-colors duration-150 md:py-1.5 md:text-[13px]",
                  active
                    ? "border-l-2 border-primary bg-primary/10 text-primary"
                    : "border-l-2 border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const userFooter = (
    <div className="border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-lg px-3 py-1.5">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {(userName || userEmail).charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{userName || userEmail}</p>
          <p className="truncate text-xs text-muted-foreground">
            {roleLabel || roleLabels[role]}
          </p>
        </div>
        <button
          onClick={handleLogout}
          title="Cerrar sesión"
          className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full">
      {/* Sidebar escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 border-b border-border p-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            {brand.name.charAt(0)}
          </div>
          <OrgSwitcher
            orgs={orgs}
            activeOrgId={orgId}
            activeOrgName={orgName}
            agencyName={agencyName}
          />
        </div>
        {nav}
        {userFooter}
      </aside>

      {/* Drawer móvil */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col bg-card shadow-xl">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <OrgSwitcher
                orgs={orgs}
                activeOrgId={orgId}
                activeOrgName={orgName}
                agencyName={agencyName}
                onNavigate={() => setMobileOpen(false)}
              />
              <button
                onClick={() => setMobileOpen(false)}
                className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted"
              >
                <X className="size-5" />
              </button>
            </div>
            {nav}
            {userFooter}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior móvil */}
        <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-border bg-card px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
            aria-label="Abrir menú"
          >
            <Menu className="size-5" />
          </button>
          <p className="truncate text-sm font-semibold">{orgName}</p>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Building2, Check, ChevronsUpDown, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OrgSummary } from "@/lib/auth";
import { switchOrg } from "@/app/agencia/actions";

interface OrgSwitcherProps {
  orgs: OrgSummary[];
  activeOrgId: string;
  activeOrgName: string;
  agencyName: string | null;
  onNavigate?: () => void;
}

/**
 * Selector de subcuenta. Solo aparece cuando hay más de una
 * organización accesible o el usuario es staff de una agencia.
 */
export function OrgSwitcher({
  orgs,
  activeOrgId,
  activeOrgName,
  agencyName,
  onNavigate,
}: OrgSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (orgs.length <= 1 && !agencyName) {
    return (
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{activeOrgName}</p>
        <p className="truncate text-xs text-muted-foreground">Tu organización</p>
      </div>
    );
  }

  function select(orgId: string) {
    setOpen(false);
    if (orgId === activeOrgId) return;
    startTransition(async () => {
      await switchOrg(orgId);
    });
  }

  return (
    <div className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted disabled:opacity-60"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{activeOrgName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {isPending ? "Cambiando…" : (agencyName ?? "Tu organización")}
          </p>
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-lg">
            {agencyName && (
              <>
                <Link
                  href="/agencia"
                  onClick={() => {
                    setOpen(false);
                    onNavigate?.();
                  }}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-primary hover:bg-muted"
                >
                  <LayoutGrid className="size-4 shrink-0" />
                  Panel de agencia
                </Link>
                <div className="my-1 border-t border-border" />
                <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Subcuentas
                </p>
              </>
            )}
            {orgs.map((org) => (
              <button
                key={org.id}
                type="button"
                onClick={() => select(org.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                  org.id === activeOrgId && "font-medium"
                )}
              >
                <Building2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{org.name}</span>
                {org.id === activeOrgId && (
                  <Check className="size-4 shrink-0 text-primary" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

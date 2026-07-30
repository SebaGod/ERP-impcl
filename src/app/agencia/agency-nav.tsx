"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, LayoutGrid, Layers, TerminalSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/agencia", label: "Resumen", icon: LayoutGrid, exact: true },
  { href: "/agencia/plantillas", label: "Plantillas", icon: Layers },
  { href: "/agencia/consola", label: "Consola", icon: TerminalSquare },
  { href: "/agencia/actividad", label: "Actividad", icon: Activity },
];

export function AgencyNav() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

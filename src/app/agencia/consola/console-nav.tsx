"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, Bot, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/agencia/consola", label: "Resumen", icon: Activity, exact: true },
  { href: "/agencia/consola/agentes", label: "Agentes", icon: Bot },
  { href: "/agencia/consola/consumo", label: "Consumo", icon: DollarSign },
];

export function ConsoleNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {tabs.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname.startsWith(tab.href);
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors duration-150",
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

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  exact?: boolean;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

const groups: NavGroup[] = [
  {
    heading: "Mi empresa",
    items: [
      { href: "/configuracion", label: "Perfil", exact: true },
      { href: "/configuracion/equipo", label: "Equipo" },
      { href: "/configuracion/exportar", label: "Exportar datos" },
    ],
  },
  {
    heading: "CRM",
    items: [
      { href: "/configuracion/campos", label: "Campos personalizados" },
      { href: "/configuracion/etiquetas", label: "Etiquetas" },
    ],
  },
  {
    heading: "Conexiones",
    items: [
      { href: "/configuracion/integraciones", label: "Integraciones" },
      { href: "/configuracion/plantillas", label: "Plantillas de WhatsApp" },
    ],
  },
];

export function ConfigNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.heading} className="flex flex-col gap-1">
          <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
            {group.heading}
          </p>
          {group.items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-2 py-1.5 text-[13px] transition-colors duration-150",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

import {
  Activity,
  Building2,
  LayoutDashboard,
  Layers,
  Plug,
  Receipt,
  Settings,
  TerminalSquare,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

export interface AgencyNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Solo marca activo con coincidencia exacta (para la raíz /agencia) */
  exact?: boolean;
  /** Clave del contador que se muestra a la derecha, si hay algo que atender */
  badge?: BadgeKey;
}

export interface AgencyNavSection {
  /** null en la sección principal: no lleva encabezado */
  label: string | null;
  items: AgencyNavItem[];
}

/**
 * Contadores vivos del menú. Se calculan en el servidor una sola vez por
 * navegación y solo se pintan cuando hay algo que atender: un número
 * permanente en el menú deja de leerse a los dos días.
 */
export type BadgeKey = "canales" | "automatizaciones";

export type AgencyBadges = Partial<Record<BadgeKey, number>>;

/**
 * Menú de la agencia. Tres bloques con una lógica: primero la cartera
 * (a quién le vendo), después la operación (qué está corriendo y qué se
 * rompió) y al final la agencia misma (cómo cobro y quién trabaja aquí).
 */
export const agencyNav: AgencyNavSection[] = [
  {
    label: null,
    items: [
      {
        href: "/agencia",
        label: "Tablero",
        icon: LayoutDashboard,
        exact: true,
      },
      { href: "/agencia/subcuentas", label: "Subcuentas", icon: Building2 },
    ],
  },
  {
    label: "Operación",
    items: [
      { href: "/agencia/canales", label: "Canales", icon: Plug, badge: "canales" },
      {
        href: "/agencia/automatizaciones",
        label: "Automatizaciones",
        icon: Zap,
        badge: "automatizaciones",
      },
      { href: "/agencia/consola", label: "Consola", icon: TerminalSquare },
      { href: "/agencia/actividad", label: "Actividad", icon: Activity },
    ],
  },
  {
    label: "Agencia",
    items: [
      { href: "/agencia/plantillas", label: "Plantillas", icon: Layers },
      { href: "/agencia/facturacion", label: "Facturación", icon: Receipt },
      { href: "/agencia/equipo", label: "Equipo", icon: Users },
      { href: "/agencia/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

/** ¿Este ítem corresponde a la ruta actual? */
export function itemActivo(item: AgencyNavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

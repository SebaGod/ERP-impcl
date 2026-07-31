import {
  Banknote,
  Bot,
  CalendarDays,
  Contact,
  FileText,
  Home,
  Inbox,
  Kanban,
  Package,
  PieChart,
  Settings,
  Target,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { OrgRole } from "@/lib/auth";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: OrgRole[];
}

export const navItems: NavItem[] = [
  { href: "/inicio", label: "Inicio", icon: Home, roles: ["admin"] },
  { href: "/conversaciones", label: "Conversaciones", icon: Inbox, roles: ["admin", "operario"] },
  { href: "/contactos", label: "Contactos", icon: Contact, roles: ["admin", "operario"] },
  { href: "/oportunidades", label: "Oportunidades", icon: Target, roles: ["admin", "operario"] },
  { href: "/calendario", label: "Calendario", icon: CalendarDays, roles: ["admin", "operario"] },
  { href: "/agentes", label: "Agentes IA", icon: Bot, roles: ["admin"] },
  { href: "/automatizaciones", label: "Automatizaciones", icon: Zap, roles: ["admin"] },
  { href: "/tablero", label: "Tablero", icon: Kanban, roles: ["admin", "operario"] },
  { href: "/cotizaciones", label: "Cotizaciones", icon: FileText, roles: ["admin"] },
  { href: "/clientes", label: "Clientes", icon: Users, roles: ["admin"] },
  { href: "/finanzas", label: "Finanzas", icon: Banknote, roles: ["admin"] },
  { href: "/insumos", label: "Insumos", icon: Package, roles: ["admin"] },
  { href: "/reportes", label: "Reportes", icon: PieChart, roles: ["admin"] },
  { href: "/configuracion", label: "Configuración", icon: Settings, roles: ["admin"] },
];

export function navItemsForRole(role: OrgRole): NavItem[] {
  return navItems.filter((item) => item.roles.includes(role));
}

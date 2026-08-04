import {
  Banknote,
  Bot,
  CalendarDays,
  Contact,
  FileText,
  Inbox,
  Kanban,
  LayoutDashboard,
  Package,
  Receipt,
  Settings,
  Target,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  groupLabels,
  modulosVisibles,
  type ModuleGroup,
  type ModuleKey,
} from "@/lib/auth/permissions";

/** Icono de cada módulo. La definición del módulo vive en permissions.ts. */
export const moduleIcons: Record<ModuleKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  conversaciones: Inbox,
  contactos: Contact,
  oportunidades: Target,
  calendario: CalendarDays,
  cotizaciones: FileText,
  documentos: Receipt,
  tablero: Kanban,
  finanzas: Banknote,
  insumos: Package,
  agentes: Bot,
  automatizaciones: Zap,
  configuracion: Settings,
};

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  group: ModuleGroup;
  label: string;
  items: NavItem[];
}

/**
 * Menú agrupado según los permisos de la persona: primero lo comercial,
 * después la operación y al final lo técnico.
 */
export function navSections(permisos: ModuleKey[]): NavSection[] {
  return modulosVisibles(permisos).map(({ group, items }) => ({
    group,
    label: groupLabels[group],
    items: items.map((m) => ({
      href: m.href,
      label: m.label,
      icon: moduleIcons[m.key],
    })),
  }));
}

/**
 * Permisos por módulo.
 *
 * Importante sobre el alcance: esto gobierna **qué ve** cada persona en la
 * interfaz, no qué puede leer la base de datos. La frontera de seguridad
 * sigue siendo la RLS, que se apoya en el rol base (admin / operario).
 * Un permiso de módulo oculta una sección; no reemplaza una policy.
 *
 * Sin dependencias de servidor: lo importan componentes de cliente.
 */

export type ModuleKey =
  | "dashboard"
  | "conversaciones"
  | "contactos"
  | "oportunidades"
  | "calendario"
  | "cotizaciones"
  | "documentos"
  | "tablero"
  | "finanzas"
  | "insumos"
  | "agentes"
  | "automatizaciones"
  | "configuracion";

/** Los módulos se agrupan para separar lo comercial de lo técnico */
export type ModuleGroup = "comercial" | "operacion" | "tecnico";

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  href: string;
  group: ModuleGroup;
  description: string;
  /** Solo el rol base admin puede tenerlo */
  soloAdmin?: boolean;
}

export const groupLabels: Record<ModuleGroup, string> = {
  comercial: "Comercial",
  operacion: "Operación",
  tecnico: "Configuración y técnico",
};

export const modules: ModuleDef[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    group: "comercial",
    description: "Gráficos de ventas, finanzas, leads y producción",
  },
  {
    key: "conversaciones",
    label: "Conversaciones",
    href: "/conversaciones",
    group: "comercial",
    description: "Inbox unificado de todos los canales",
  },
  {
    key: "contactos",
    label: "Contactos",
    href: "/contactos",
    group: "comercial",
    description: "Fichas de clientes y prospectos",
  },
  {
    key: "oportunidades",
    label: "Oportunidades",
    href: "/oportunidades",
    group: "comercial",
    description: "Embudo de ventas",
  },
  {
    key: "calendario",
    label: "Calendario",
    href: "/calendario",
    group: "comercial",
    description: "Citas y agenda",
  },
  {
    key: "cotizaciones",
    label: "Cotizaciones",
    href: "/cotizaciones",
    group: "comercial",
    description: "Cotizaciones y su aprobación",
  },
  {
    key: "documentos",
    label: "Boletas y facturas",
    href: "/documentos",
    group: "operacion",
    description: "Registro de documentos tributarios y libro de ventas",
    // Una boleta dice cuánto se le cobró al cliente, igual que una
    // cotización. Las cotizaciones y las finanzas ya eran solo de admin;
    // los documentos tributarios no, así que un operario no veía el precio
    // cotizado pero sí el facturado por el mismo trabajo. Era la misma
    // información entrando por otra puerta.
    soloAdmin: true,
  },
  {
    key: "tablero",
    label: "Tablero",
    href: "/tablero",
    group: "operacion",
    description: "Órdenes de trabajo en producción",
  },
  {
    key: "finanzas",
    label: "Finanzas",
    href: "/finanzas",
    group: "operacion",
    description: "Ingresos, gastos y cobranzas",
  },
  {
    key: "insumos",
    label: "Insumos",
    href: "/insumos",
    group: "operacion",
    description: "Inventario, compras y proveedores",
  },
  {
    key: "agentes",
    label: "Agentes IA",
    href: "/agentes",
    group: "tecnico",
    description: "Configuración de los agentes",
    soloAdmin: true,
  },
  {
    key: "automatizaciones",
    label: "Automatizaciones",
    href: "/automatizaciones",
    group: "tecnico",
    description: "Reglas que corren solas",
    soloAdmin: true,
  },
  {
    key: "configuracion",
    label: "Configuración",
    href: "/configuracion",
    group: "tecnico",
    description: "Equipo, integraciones y personalización",
    soloAdmin: true,
  },
];

export const moduleGroups: ModuleGroup[] = ["comercial", "operacion", "tecnico"];

export function getModule(key: string): ModuleDef | undefined {
  return modules.find((m) => m.key === key);
}

/** Todo lo que un admin ve por defecto */
export const PERMISOS_ADMIN: ModuleKey[] = modules.map((m) => m.key);

/** Lo que ve un operario de producción si nadie le definió un perfil */
export const PERMISOS_OPERARIO: ModuleKey[] = ["tablero"];

/**
 * Perfiles sugeridos al crear un usuario. No se guardan aquí: son plantillas
 * que el administrador puede tomar y ajustar.
 */
export const PERFILES_SUGERIDOS: {
  key: string;
  label: string;
  description: string;
  base_role: "admin" | "operario";
  permissions: ModuleKey[];
}[] = [
  {
    key: "vendedor",
    label: "Vendedor",
    description: "Atiende conversaciones, gestiona contactos y cierra ventas.",
    base_role: "operario",
    permissions: [
      "dashboard",
      "conversaciones",
      "contactos",
      "oportunidades",
      "calendario",
      "cotizaciones",
    ],
  },
  {
    key: "contador",
    label: "Contador",
    description: "Ve finanzas y cotizaciones, sin acceso al resto del CRM.",
    base_role: "operario",
    permissions: ["dashboard", "finanzas", "cotizaciones", "documentos"],
  },
  {
    key: "produccion",
    label: "Producción",
    description: "Solo el tablero de órdenes y los insumos.",
    base_role: "operario",
    permissions: ["tablero", "insumos"],
  },
  {
    key: "administrador",
    label: "Administrador",
    description: "Acceso completo, incluida la configuración.",
    base_role: "admin",
    permissions: PERMISOS_ADMIN,
  },
];

/**
 * Permisos efectivos de una persona.
 *
 * Si tiene permisos explícitos se usan esos, filtrando los módulos que exigen
 * rol admin. Si no, se derivan del rol base, para que las cuentas creadas
 * antes de existir los perfiles sigan funcionando igual.
 */
export function permisosEfectivos(
  baseRole: "admin" | "operario",
  permisos: unknown
): ModuleKey[] {
  if (Array.isArray(permisos) && permisos.length > 0) {
    const validos = new Set(modules.map((m) => m.key as string));
    const lista = permisos
      .filter((p): p is string => typeof p === "string" && validos.has(p))
      .map((p) => p as ModuleKey);
    if (baseRole === "admin") return lista;
    // Un operario nunca ve los módulos marcados como solo admin, aunque
    // alguien se los haya asignado por error.
    return lista.filter((k) => !getModule(k)?.soloAdmin);
  }
  return baseRole === "admin" ? PERMISOS_ADMIN : PERMISOS_OPERARIO;
}

/** ¿Puede ver este módulo? */
export function puedeVer(permisos: ModuleKey[], modulo: ModuleKey): boolean {
  return permisos.includes(modulo);
}

/** Módulos visibles agrupados y en orden, para pintar el menú */
export function modulosVisibles(
  permisos: ModuleKey[]
): { group: ModuleGroup; items: ModuleDef[] }[] {
  return moduleGroups
    .map((group) => ({
      group,
      items: modules.filter(
        (m) => m.group === group && permisos.includes(m.key)
      ),
    }))
    .filter((g) => g.items.length > 0);
}

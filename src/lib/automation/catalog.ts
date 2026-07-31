/**
 * Catálogo de automatizaciones: disparadores, condiciones y acciones.
 *
 * El constructor visual se genera entero desde estos metadatos, igual que el
 * panel de integraciones: agregar una acción nueva es agregar una entrada aquí,
 * no tocar la interfaz.
 *
 * Sin dependencias de servidor: lo importan componentes de cliente.
 */

export type TriggerKind =
  | "contacto_creado"
  | "conversacion_creada"
  | "mensaje_entrante"
  | "oportunidad_creada"
  | "etapa_cambiada"
  | "cita_agendada"
  | "sin_respuesta";

export type ActionKind =
  | "crear_oportunidad"
  | "mover_etapa"
  | "asignar_responsable"
  | "agregar_etiqueta"
  | "quitar_etiqueta"
  | "cambiar_lifecycle"
  | "enviar_mensaje"
  | "activar_agente"
  | "pausar_agente"
  | "programar_seguimiento"
  | "notificar_equipo";

export type OperatorKind =
  | "es"
  | "no_es"
  | "contiene"
  | "no_contiene"
  | "mayor_que"
  | "menor_que"
  | "existe"
  | "no_existe";

export interface TriggerDef {
  kind: TriggerKind;
  label: string;
  description: string;
  /** Icono de lucide-react, por nombre */
  icon: string;
  /** Campos disponibles para condicionar cuando dispara este evento */
  camposDisponibles: string[];
}

export interface ActionDef {
  kind: ActionKind;
  label: string;
  description: string;
  icon: string;
  /** Configuración que pide la acción */
  config: {
    key: string;
    label: string;
    type: "texto" | "texto_largo" | "numero" | "etapa" | "etiqueta" | "usuario" | "lifecycle" | "horas";
    required?: boolean;
    help?: string;
  }[];
}

export const triggers: TriggerDef[] = [
  {
    kind: "contacto_creado",
    label: "Se crea un contacto",
    description: "Cuando entra un contacto nuevo, sin importar el canal.",
    icon: "UserPlus",
    camposDisponibles: ["nombre", "email", "telefono", "empresa", "origen", "etiqueta"],
  },
  {
    kind: "conversacion_creada",
    label: "Empieza una conversación",
    description: "Cuando alguien escribe por primera vez por cualquier canal.",
    icon: "MessageSquarePlus",
    camposDisponibles: ["canal", "etiqueta"],
  },
  {
    kind: "mensaje_entrante",
    label: "Llega un mensaje",
    description: "Cada vez que el contacto escribe en una conversación.",
    icon: "MessageSquare",
    camposDisponibles: ["canal", "texto", "etiqueta"],
  },
  {
    kind: "oportunidad_creada",
    label: "Se crea una oportunidad",
    description: "Cuando entra una oportunidad nueva al embudo.",
    icon: "Target",
    camposDisponibles: ["valor", "etapa", "etiqueta"],
  },
  {
    kind: "etapa_cambiada",
    label: "Cambia de etapa",
    description: "Cuando una oportunidad se mueve de columna en el embudo.",
    icon: "MoveRight",
    camposDisponibles: ["etapa", "etapa_anterior", "valor", "etiqueta"],
  },
  {
    kind: "cita_agendada",
    label: "Se agenda una cita",
    description: "Cuando el agente o el equipo agenda una cita.",
    icon: "CalendarCheck",
    camposDisponibles: ["etiqueta"],
  },
  {
    kind: "sin_respuesta",
    label: "El lead no responde",
    description:
      "Cuando pasa un tiempo sin respuesta del contacto tras un mensaje del equipo o del agente.",
    icon: "Clock",
    camposDisponibles: ["canal", "horas_sin_respuesta", "etiqueta"],
  },
];

export const actions: ActionDef[] = [
  {
    kind: "crear_oportunidad",
    label: "Crear oportunidad",
    description: "Ingresa el contacto al embudo automáticamente.",
    icon: "Target",
    config: [
      { key: "titulo", label: "Título", type: "texto", help: "Si lo dejas vacío se usa el nombre del contacto" },
      { key: "stage_id", label: "Etapa inicial", type: "etapa" },
      { key: "valor", label: "Valor estimado", type: "numero" },
    ],
  },
  {
    kind: "mover_etapa",
    label: "Mover de etapa",
    description: "Cambia la oportunidad a otra columna del embudo.",
    icon: "MoveRight",
    config: [{ key: "stage_id", label: "Etapa destino", type: "etapa", required: true }],
  },
  {
    kind: "asignar_responsable",
    label: "Asignar responsable",
    description: "Deja el contacto u oportunidad a cargo de alguien del equipo.",
    icon: "UserCheck",
    config: [{ key: "user_id", label: "Responsable", type: "usuario", required: true }],
  },
  {
    kind: "agregar_etiqueta",
    label: "Agregar etiqueta",
    description: "Marca el contacto para poder filtrarlo después.",
    icon: "Tag",
    config: [{ key: "tag", label: "Etiqueta", type: "etiqueta", required: true }],
  },
  {
    kind: "quitar_etiqueta",
    label: "Quitar etiqueta",
    description: "Saca una etiqueta del contacto.",
    icon: "TagsIcon",
    config: [{ key: "tag", label: "Etiqueta", type: "etiqueta", required: true }],
  },
  {
    kind: "cambiar_lifecycle",
    label: "Cambiar etapa del contacto",
    description: "Mueve el contacto entre lead, calificado, cliente…",
    icon: "Users",
    config: [{ key: "lifecycle", label: "Etapa", type: "lifecycle", required: true }],
  },
  {
    kind: "enviar_mensaje",
    label: "Enviar mensaje",
    description: "Manda un mensaje por el mismo canal de la conversación.",
    icon: "Send",
    config: [
      {
        key: "texto",
        label: "Mensaje",
        type: "texto_largo",
        required: true,
        help: "Puedes usar {{nombre}} para personalizar",
      },
    ],
  },
  {
    kind: "activar_agente",
    label: "Activar el agente",
    description: "Deja que la IA responda esta conversación.",
    icon: "Bot",
    config: [],
  },
  {
    kind: "pausar_agente",
    label: "Pausar el agente",
    description: "La IA deja de responder y atiende una persona.",
    icon: "BotOff",
    config: [],
  },
  {
    kind: "programar_seguimiento",
    label: "Programar seguimiento",
    description:
      "Arma el drip de seguimiento. Se cancela solo si el contacto responde.",
    icon: "AlarmClock",
    config: [
      {
        key: "horas",
        label: "Primer recordatorio",
        type: "horas",
        required: true,
        help: "Horas de espera antes del primer mensaje de seguimiento",
      },
    ],
  },
  {
    kind: "notificar_equipo",
    label: "Avisar al equipo",
    description: "Deja un aviso interno para que alguien lo tome.",
    icon: "Bell",
    config: [
      { key: "mensaje", label: "Aviso", type: "texto", required: true },
    ],
  },
];

export const operators: { kind: OperatorKind; label: string; sinValor?: boolean }[] = [
  { kind: "es", label: "es igual a" },
  { kind: "no_es", label: "no es igual a" },
  { kind: "contiene", label: "contiene" },
  { kind: "no_contiene", label: "no contiene" },
  { kind: "mayor_que", label: "es mayor que" },
  { kind: "menor_que", label: "es menor que" },
  { kind: "existe", label: "tiene valor", sinValor: true },
  { kind: "no_existe", label: "está vacío", sinValor: true },
];

export function getTrigger(kind: string): TriggerDef | undefined {
  return triggers.find((t) => t.kind === kind);
}

export function getAction(kind: string): ActionDef | undefined {
  return actions.find((a) => a.kind === kind);
}

export function getOperator(kind: string) {
  return operators.find((o) => o.kind === kind);
}

/** Una condición configurada en una automatización */
export interface Condition {
  campo: string;
  operador: OperatorKind;
  valor?: string;
}

/** Una acción configurada */
export interface ConfiguredAction {
  tipo: ActionKind;
  config: Record<string, string | number | undefined>;
}

export interface AutomationRow {
  id: string;
  name: string;
  description: string | null;
  trigger_kind: TriggerKind;
  trigger_config: Record<string, unknown>;
  conditions: Condition[];
  actions: ConfiguredAction[];
  is_active: boolean;
  run_count: number;
  last_run_at: string | null;
  created_at: string;
}

/**
 * Evalúa una condición contra el contexto del evento. Pura y tolerante: un
 * campo ausente no revienta, se trata como vacío.
 */
export function evaluarCondicion(
  condicion: Condition,
  contexto: Record<string, unknown>
): boolean {
  const bruto = contexto[condicion.campo];
  const existe =
    bruto !== undefined &&
    bruto !== null &&
    !(typeof bruto === "string" && bruto.trim() === "") &&
    !(Array.isArray(bruto) && bruto.length === 0);

  if (condicion.operador === "existe") return existe;
  if (condicion.operador === "no_existe") return !existe;

  const esperado = (condicion.valor ?? "").trim().toLowerCase();

  // Los arreglos (etiquetas) se comparan por pertenencia
  if (Array.isArray(bruto)) {
    const lista = bruto.map((v) => String(v).toLowerCase());
    switch (condicion.operador) {
      case "es":
      case "contiene":
        return lista.includes(esperado);
      case "no_es":
      case "no_contiene":
        return !lista.includes(esperado);
      default:
        return false;
    }
  }

  if (condicion.operador === "mayor_que" || condicion.operador === "menor_que") {
    const a = Number(bruto);
    const b = Number(condicion.valor);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    return condicion.operador === "mayor_que" ? a > b : a < b;
  }

  const actual = String(bruto ?? "").toLowerCase();
  switch (condicion.operador) {
    case "es":
      return actual === esperado;
    case "no_es":
      return actual !== esperado;
    case "contiene":
      return actual.includes(esperado);
    case "no_contiene":
      return !actual.includes(esperado);
    default:
      return false;
  }
}

/** Todas las condiciones se evalúan en Y. Sin condiciones, siempre corre. */
export function condicionesSeCumplen(
  condiciones: Condition[],
  contexto: Record<string, unknown>
): boolean {
  if (!condiciones || condiciones.length === 0) return true;
  return condiciones.every((c) => evaluarCondicion(c, contexto));
}

/** Reemplaza {{campo}} con el valor del contexto. Lo que no calza queda vacío. */
export function interpolar(
  plantilla: string,
  contexto: Record<string, unknown>
): string {
  return plantilla.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, clave: string) => {
    const valor = contexto[clave];
    return valor === undefined || valor === null ? "" : String(valor);
  });
}

/** Resumen legible de una automatización, para las tarjetas del listado */
export function describirAutomatizacion(a: {
  trigger_kind: string;
  conditions: Condition[];
  actions: ConfiguredAction[];
}): string {
  const trigger = getTrigger(a.trigger_kind);
  const partes: string[] = [trigger?.label ?? a.trigger_kind];
  const nCond = a.conditions?.length ?? 0;
  if (nCond > 0) {
    partes.push(`${nCond} ${nCond === 1 ? "condición" : "condiciones"}`);
  }
  const nAcc = a.actions?.length ?? 0;
  partes.push(`${nAcc} ${nAcc === 1 ? "acción" : "acciones"}`);
  return partes.join(" · ");
}

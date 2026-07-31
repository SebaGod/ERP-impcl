"use client";

import {
  useActionState,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  AlarmClock,
  Bell,
  Bot,
  BotOff,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Filter,
  MessageSquare,
  MessageSquarePlus,
  MoveRight,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  Tag,
  TagsIcon,
  Target,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserPlus,
  Users,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  actions as catalogoAcciones,
  getAction,
  getOperator,
  getTrigger,
  operators,
  triggers,
  type ActionDef,
  type ActionKind,
  type AutomationRow,
  type Condition,
  type ConfiguredAction,
  type OperatorKind,
  type TriggerKind,
} from "@/lib/automation/catalog";
import type { FieldDef } from "@/lib/crm/custom-fields";
import {
  envolver,
  tagDeCampo,
  tagsDesconocidas,
  tagsDisponibles,
} from "@/lib/crm/merge-tags";
import {
  alternarAutomatizacion,
  eliminarAutomatizacion,
  guardarAutomatizacion,
  type ActionState,
} from "./actions";

const initialState: ActionState = { error: null };

/**
 * El catálogo guarda el icono por nombre para no arrastrar dependencias de
 * lucide dentro de una librería que también corre en el servidor. Acá se
 * resuelve el nombre contra los iconos que efectivamente usamos.
 */
const ICONS: Record<string, LucideIcon> = {
  AlarmClock,
  Bell,
  Bot,
  BotOff,
  CalendarCheck,
  Clock,
  MessageSquare,
  MessageSquarePlus,
  MoveRight,
  Send,
  Tag,
  TagsIcon,
  Target,
  UserCheck,
  UserPlus,
  Users,
};

/** Los campos condicionables vienen como clave técnica del catálogo. */
const camposLabels: Record<string, string> = {
  nombre: "Nombre",
  email: "Email",
  telefono: "Teléfono",
  empresa: "Empresa",
  origen: "Origen",
  etiqueta: "Etiqueta",
  canal: "Canal",
  texto: "Texto del mensaje",
  valor: "Valor",
  etapa: "Etapa",
  etapa_anterior: "Etapa anterior",
  horas_sin_respuesta: "Horas sin respuesta",
};

const lifecycles: { value: string; label: string }[] = [
  { value: "lead", label: "Lead" },
  { value: "oportunidad", label: "Oportunidad" },
  { value: "cliente", label: "Cliente" },
  { value: "perdido", label: "Perdido" },
];

/**
 * El catálogo no trae familias, pero un selector plano de once acciones se
 * lee peor que tres bloques cortos. Lo que no esté acá cae en "Otras".
 */
const GRUPOS_ACCION: { titulo: string; kinds: ActionKind[] }[] = [
  {
    titulo: "Embudo",
    kinds: ["crear_oportunidad", "mover_etapa", "asignar_responsable"],
  },
  {
    titulo: "Contacto",
    kinds: ["agregar_etiqueta", "quitar_etiqueta", "cambiar_lifecycle"],
  },
  {
    titulo: "Conversación",
    kinds: [
      "enviar_mensaje",
      "activar_agente",
      "pausar_agente",
      "programar_seguimiento",
    ],
  },
  { titulo: "Equipo", kinds: ["notificar_equipo"] },
];

/** Referencia estable: evita recalcular las claves de fusión en cada render. */
const SIN_CAMPOS: FieldDef[] = [];

export interface StageOption {
  id: string;
  name: string;
  pipeline_id: string;
  kind: string;
}

export interface TagOption {
  key: string;
  label: string;
}

export interface UserOption {
  id: string;
  name: string;
}

interface AutomationBuilderProps {
  stages: StageOption[];
  tags: TagOption[];
  usuarios: UserOption[];
  /** Campos personalizados de la organización, para condiciones y variables */
  campos?: FieldDef[];
  /** Automatización existente cuando se está editando */
  inicial?: AutomationRow | null;
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function recortar(texto: string, largo = 48): string {
  return texto.length > largo ? `${texto.slice(0, largo - 1)}…` : texto;
}

export function AutomationBuilder({
  stages,
  tags,
  usuarios,
  campos = SIN_CAMPOS,
  inicial,
}: AutomationBuilderProps) {
  const [state, formAction, pending] = useActionState(
    guardarAutomatizacion,
    initialState
  );
  const [triggerKind, setTriggerKind] = useState<TriggerKind>(
    inicial?.trigger_kind ?? triggers[0].kind
  );
  const [conditions, setConditions] = useState<Condition[]>(
    inicial?.conditions ?? []
  );
  const [acciones, setAcciones] = useState<ConfiguredAction[]>(
    inicial?.actions ?? []
  );
  const [panelDisparador, setPanelDisparador] = useState(false);
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  /** Posición del flujo donde está abierto el selector de acciones */
  const [insertarEn, setInsertarEn] = useState<number | null>(null);
  /** Índice de la acción expandida para editar */
  const [expandida, setExpandida] = useState<number | null>(null);

  const trigger = getTrigger(triggerKind);
  const camposEvento = trigger?.camposDisponibles ?? [];

  const camposPersonalizados = useMemo(
    () => campos.map((def) => ({ clave: tagDeCampo(def).key, label: def.label })),
    [campos]
  );
  const etiquetasCustom = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const campo of camposPersonalizados) mapa.set(campo.clave, campo.label);
    return mapa;
  }, [camposPersonalizados]);
  const gruposTags = useMemo(() => tagsDisponibles(campos), [campos]);
  const clavesDisponibles = useMemo(
    () => gruposTags.flatMap((g) => g.tags.map((t) => t.key)),
    [gruposTags]
  );

  function nombreDeCampo(clave: string): string {
    return etiquetasCustom.get(clave) ?? camposLabels[clave] ?? clave;
  }

  function elegirTrigger(kind: TriggerKind) {
    setTriggerKind(kind);
    setPanelDisparador(false);
    // Los campos condicionables dependen del evento: las condiciones que ya
    // no aplican se descartan. Las de campos personalizados siempre sirven.
    const disponibles = getTrigger(kind)?.camposDisponibles ?? [];
    setConditions((prev) =>
      prev.filter(
        (c) => disponibles.includes(c.campo) || etiquetasCustom.has(c.campo)
      )
    );
  }

  function agregarCondicion() {
    const primera = camposEvento[0] ?? camposPersonalizados[0]?.clave;
    if (!primera) return;
    setConditions((prev) => [
      ...prev,
      { campo: primera, operador: "es", valor: "" },
    ]);
    setFiltroAbierto(true);
  }

  function actualizarCondicion(indice: number, cambio: Partial<Condition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === indice ? { ...c, ...cambio } : c))
    );
  }

  function quitarCondicion(indice: number) {
    setConditions((prev) => prev.filter((_, i) => i !== indice));
  }

  function insertarAccion(posicion: number, tipo: ActionKind) {
    setAcciones((prev) => {
      const copia = [...prev];
      copia.splice(posicion, 0, { tipo, config: {} });
      return copia;
    });
    setInsertarEn(null);
    setExpandida(posicion);
  }

  function actualizarConfig(
    indice: number,
    clave: string,
    bruto: string,
    numerico: boolean
  ) {
    const valor: string | number | undefined = numerico
      ? bruto === ""
        ? undefined
        : Number(bruto)
      : bruto;
    setAcciones((prev) =>
      prev.map((a, i) =>
        i === indice ? { ...a, config: { ...a.config, [clave]: valor } } : a
      )
    );
  }

  function moverAccion(indice: number, delta: number) {
    const destino = indice + delta;
    if (destino < 0 || destino >= acciones.length) return;
    setAcciones((prev) => {
      const copia = [...prev];
      const [movida] = copia.splice(indice, 1);
      copia.splice(destino, 0, movida);
      return copia;
    });
    // La tarjeta abierta sigue a su acción, no a su posición.
    setExpandida((prev) => {
      if (prev === null) return prev;
      if (prev === indice) return destino;
      if (prev === destino) return indice;
      return prev;
    });
  }

  function duplicarAccion(indice: number) {
    setAcciones((prev) => {
      const copia = [...prev];
      const original = prev[indice];
      copia.splice(indice + 1, 0, {
        tipo: original.tipo,
        config: { ...original.config },
      });
      return copia;
    });
    setExpandida(indice + 1);
  }

  function quitarAccion(indice: number) {
    setAcciones((prev) => prev.filter((_, i) => i !== indice));
    setExpandida((prev) => {
      if (prev === null) return prev;
      if (prev === indice) return null;
      return prev > indice ? prev - 1 : prev;
    });
  }

  const textoCondiciones = conditions
    .map((c) => {
      const operador = getOperator(c.operador);
      const etiqueta = `${nombreDeCampo(c.campo)} ${operador?.label ?? c.operador}`;
      if (operador?.sinValor) return etiqueta;
      const valor = (c.valor ?? "").trim();
      return valor ? `${etiqueta} ${valor}` : `${etiqueta} …`;
    })
    .join(" Y ");

  const hayFiltro = conditions.length > 0 || filtroAbierto;

  const resumen = [
    `Cuando ${(trigger?.label ?? "ocurra el evento").toLowerCase()}`,
    conditions.length > 0
      ? plural(conditions.length, "condición", "condiciones")
      : "sin condiciones",
    plural(acciones.length, "acción", "acciones"),
  ].join(" · ");

  const IconoTrigger = trigger ? ICONS[trigger.icon] ?? Zap : Zap;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {inicial && <input type="hidden" name="id" value={inicial.id} />}
      <input type="hidden" name="trigger_kind" value={triggerKind} />
      <input
        type="hidden"
        name="conditions_json"
        value={JSON.stringify(conditions)}
      />
      <input
        type="hidden"
        name="actions_json"
        value={JSON.stringify(acciones)}
      />

      <section className="mx-auto w-full max-w-2xl rounded-xl border border-border bg-card p-3 shadow-sm">
        <Label htmlFor="automation-name" className="sr-only">
          Nombre de la automatización
        </Label>
        <Input
          id="automation-name"
          name="name"
          required
          maxLength={80}
          defaultValue={inicial?.name ?? ""}
          placeholder="Nombre de la automatización"
          className="h-11 border-transparent bg-transparent px-2 text-lg font-semibold transition-colors hover:bg-muted/60 focus-visible:border-border focus-visible:bg-card"
        />
        <Label htmlFor="automation-description" className="sr-only">
          Descripción
        </Label>
        <Input
          id="automation-description"
          name="description"
          maxLength={160}
          defaultValue={inicial?.description ?? ""}
          placeholder="Para qué sirve, en una línea (opcional)"
          className="h-9 border-transparent bg-transparent px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:border-border focus-visible:bg-card"
        />
      </section>

      {/* Lienzo del flujo */}
      <div className="mx-auto w-full max-w-2xl">
        {/* Disparador */}
        <div
          className={cn(
            "rounded-xl border border-primary/40 bg-primary/5 shadow-sm transition-colors",
            panelDisparador && "ring-2 ring-primary/30"
          )}
        >
          <button
            type="button"
            onClick={() => setPanelDisparador((v) => !v)}
            aria-expanded={panelDisparador}
            className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-primary/10"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <IconoTrigger className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                Cuando pase esto
              </span>
              <span className="block truncate text-sm font-medium">
                {trigger?.label ?? "Elige un disparador"}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {trigger?.description ?? "Sin evento configurado"}
              </span>
            </span>
            <ChevronDown
              className={cn(
                "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                panelDisparador && "rotate-180"
              )}
            />
          </button>

          {panelDisparador && (
            <div className="border-t border-primary/30 p-3">
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                Elige el disparador
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {triggers.map((t) => {
                  const Icono = ICONS[t.icon] ?? Zap;
                  const activo = t.kind === triggerKind;
                  return (
                    <button
                      key={t.kind}
                      type="button"
                      onClick={() => elegirTrigger(t.kind)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border border-border bg-card p-2.5 text-left transition-colors duration-150",
                        activo ? "ring-2 ring-primary" : "hover:bg-muted"
                      )}
                    >
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <Icono className="size-4 shrink-0 text-primary" />
                        {t.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {t.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <Conector />

        {/* Filtro */}
        {hayFiltro ? (
          <div className="rounded-xl border border-border bg-card shadow-sm">
            <button
              type="button"
              onClick={() => setFiltroAbierto((v) => !v)}
              aria-expanded={filtroAbierto}
              className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors duration-150 hover:bg-muted/60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Filter className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                  Si se cumple
                </span>
                <span className="block truncate text-sm font-medium">
                  {textoCondiciones || "Sin condiciones todavía"}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {conditions.length > 0
                    ? "Todas las condiciones deben cumplirse"
                    : "Sin condiciones corre cada vez que ocurre el evento"}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-150",
                  filtroAbierto && "rotate-180"
                )}
              />
            </button>

            {filtroAbierto && (
              <div className="flex flex-col gap-2 border-t border-border p-3">
                {conditions.map((condicion, indice) => {
                  const operador = getOperator(condicion.operador);
                  return (
                    <div
                      key={indice}
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                    >
                      <Select
                        aria-label="Campo"
                        value={condicion.campo}
                        onChange={(e) =>
                          actualizarCondicion(indice, { campo: e.target.value })
                        }
                      >
                        {camposEvento.length > 0 && (
                          <optgroup label="Campos del evento">
                            {camposEvento.map((campo) => (
                              <option key={campo} value={campo}>
                                {nombreDeCampo(campo)}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {camposPersonalizados.length > 0 && (
                          <optgroup label="Campos personalizados">
                            {camposPersonalizados.map((campo) => (
                              <option key={campo.clave} value={campo.clave}>
                                {campo.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </Select>
                      <Select
                        aria-label="Operador"
                        value={condicion.operador}
                        onChange={(e) =>
                          actualizarCondicion(indice, {
                            operador: e.target.value as OperatorKind,
                          })
                        }
                      >
                        {operators.map((o) => (
                          <option key={o.kind} value={o.kind}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                      {operador?.sinValor ? (
                        <span className="hidden items-center text-xs text-muted-foreground sm:flex">
                          Sin valor
                        </span>
                      ) : (
                        <Input
                          aria-label="Valor"
                          placeholder="Valor"
                          value={condicion.valor ?? ""}
                          onChange={(e) =>
                            actualizarCondicion(indice, {
                              valor: e.target.value,
                            })
                          }
                        />
                      )}
                      <button
                        type="button"
                        onClick={() => quitarCondicion(indice)}
                        title="Eliminar condición"
                        className="justify-self-start rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  );
                })}

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={agregarCondicion}
                    disabled={
                      camposEvento.length === 0 &&
                      camposPersonalizados.length === 0
                    }
                  >
                    <Plus className="size-4" /> Agregar condición
                  </Button>
                  {conditions.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setFiltroAbierto(false)}
                      className="text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    >
                      Quitar el filtro
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={agregarCondicion}
            className="mx-auto flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary"
          >
            <Filter className="size-3.5" /> Agregar filtro
          </button>
        )}

        {/* Acciones */}
        {acciones.map((accion, indice) => {
          const def = getAction(accion.tipo);
          return (
            <div key={indice}>
              <Conector onInsertar={() => setInsertarEn(indice)} />
              {insertarEn === indice && (
                <SelectorAcciones
                  key={`selector-${indice}`}
                  onElegir={(kind) => insertarAccion(indice, kind)}
                  onCerrar={() => setInsertarEn(null)}
                />
              )}
              {def && (
                <NodoAccion
                  numero={indice + 1}
                  def={def}
                  accion={accion}
                  abierta={expandida === indice}
                  primera={indice === 0}
                  ultima={indice === acciones.length - 1}
                  stages={stages}
                  tags={tags}
                  usuarios={usuarios}
                  gruposTags={gruposTags}
                  clavesDisponibles={clavesDisponibles}
                  onAlternar={() =>
                    setExpandida((prev) => (prev === indice ? null : indice))
                  }
                  onCambiar={(clave, valor, numerico) =>
                    actualizarConfig(indice, clave, valor, numerico)
                  }
                  onSubir={() => moverAccion(indice, -1)}
                  onBajar={() => moverAccion(indice, 1)}
                  onDuplicar={() => duplicarAccion(indice)}
                  onEliminar={() => quitarAccion(indice)}
                />
              )}
            </div>
          );
        })}

        <Conector onInsertar={() => setInsertarEn(acciones.length)} />
        {insertarEn === acciones.length && (
          <SelectorAcciones
            key={`selector-${acciones.length}`}
            onElegir={(kind) => insertarAccion(acciones.length, kind)}
            onCerrar={() => setInsertarEn(null)}
          />
        )}

        {acciones.length === 0 && insertarEn === null && (
          <>
            <p className="text-center text-xs text-muted-foreground">
              Todavía no hay acciones. Usa el + para agregar la primera.
            </p>
            <Conector />
          </>
        )}

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-border" />
          Fin del flujo
        </div>
      </div>

      <div className="sticky bottom-4 mx-auto flex w-full max-w-2xl flex-col gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-sm font-medium">{resumen}</p>
          <p className="text-xs text-muted-foreground">
            {inicial
              ? "Los cambios se aplican a la próxima ejecución."
              : "Se guarda pausada: actívala desde el listado cuando quieras que empiece a correr."}
          </p>
          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {inicial && <BotonEliminar id={inicial.id} />}
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
        </div>
      </div>
    </form>
  );
}

/**
 * La línea que une dos nodos. Con `onInsertar` lleva encima el botón redondo
 * que agrega una acción justo en esa posición del flujo.
 */
function Conector({ onInsertar }: { onInsertar?: () => void }) {
  return (
    <div
      className={cn(
        "relative mx-auto w-px bg-border",
        onInsertar ? "h-10" : "h-8"
      )}
    >
      {onInsertar && (
        <button
          type="button"
          onClick={onInsertar}
          title="Insertar acción aquí"
          aria-label="Insertar acción aquí"
          className="absolute left-1/2 top-1/2 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors duration-150 hover:border-primary hover:text-primary"
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Panel desplegable con el catálogo de acciones, buscable y agrupado. */
function SelectorAcciones({
  onElegir,
  onCerrar,
}: {
  onElegir: (kind: ActionKind) => void;
  onCerrar: () => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  const consulta = normalizar(busqueda.trim());
  const filtradas =
    consulta === ""
      ? catalogoAcciones
      : catalogoAcciones.filter((a) =>
          normalizar(`${a.label} ${a.description}`).includes(consulta)
        );

  const asignadas = new Set<string>(GRUPOS_ACCION.flatMap((g) => g.kinds));
  const grupos = [
    ...GRUPOS_ACCION.map((g) => ({
      titulo: g.titulo,
      items: filtradas.filter((a) => g.kinds.includes(a.kind)),
    })),
    {
      titulo: "Otras",
      items: filtradas.filter((a) => !asignadas.has(a.kind)),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar acción"
            aria-label="Buscar acción"
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar"
          aria-label="Cerrar selector"
          className="rounded-lg p-2 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="max-h-80 overflow-y-auto p-3">
        {grupos.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            Ninguna acción coincide con “{busqueda}”.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {grupos.map((grupo) => (
              <div key={grupo.titulo} className="flex flex-col gap-1.5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {grupo.titulo}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {grupo.items.map((a) => {
                    const Icono = ICONS[a.icon] ?? Zap;
                    return (
                      <button
                        key={a.kind}
                        type="button"
                        onClick={() => onElegir(a.kind)}
                        className="flex flex-col gap-1 rounded-lg border border-border p-2.5 text-left transition-colors duration-150 hover:bg-muted"
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Icono className="size-4 shrink-0 text-primary" />
                          {a.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {a.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface NodoAccionProps {
  numero: number;
  def: ActionDef;
  accion: ConfiguredAction;
  abierta: boolean;
  primera: boolean;
  ultima: boolean;
  stages: StageOption[];
  tags: TagOption[];
  usuarios: UserOption[];
  gruposTags: { group: string; tags: { key: string; label: string }[] }[];
  clavesDisponibles: string[];
  onAlternar: () => void;
  onCambiar: (clave: string, valor: string, numerico: boolean) => void;
  onSubir: () => void;
  onBajar: () => void;
  onDuplicar: () => void;
  onEliminar: () => void;
}

function NodoAccion({
  numero,
  def,
  accion,
  abierta,
  primera,
  ultima,
  stages,
  tags,
  usuarios,
  gruposTags,
  clavesDisponibles,
  onAlternar,
  onCambiar,
  onSubir,
  onBajar,
  onDuplicar,
  onEliminar,
}: NodoAccionProps) {
  const Icono = ICONS[def.icon] ?? Zap;

  const partes: string[] = [];
  const faltantes: string[] = [];
  for (const campo of def.config) {
    const bruto = accion.config[campo.key];
    const texto = bruto === undefined || bruto === null ? "" : String(bruto);
    if (texto.trim() === "") {
      if (campo.required) faltantes.push(campo.label);
      continue;
    }
    partes.push(`${campo.label}: ${valorLegible(campo, texto, stages, tags, usuarios)}`);
  }

  const resumen = partes.join(" · ");

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card shadow-sm transition-colors duration-150",
        abierta ? "border-primary/50" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        className="flex w-full items-center gap-3 rounded-xl p-3 pr-28 text-left transition-colors duration-150 hover:bg-muted/60"
      >
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
          {numero}
        </span>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icono className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{def.label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {resumen || def.description}
          </span>
          {faltantes.length > 0 && (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-warning">
              <TriangleAlert className="size-3 shrink-0" />
              Falta configurar: {faltantes.join(", ")}
            </span>
          )}
        </span>
      </button>

      <div className="absolute right-2 top-3 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
        <BotonNodo titulo="Subir" onClick={onSubir} disabled={primera}>
          <ChevronUp className="size-4" />
        </BotonNodo>
        <BotonNodo titulo="Bajar" onClick={onBajar} disabled={ultima}>
          <ChevronDown className="size-4" />
        </BotonNodo>
        <BotonNodo titulo="Duplicar" onClick={onDuplicar}>
          <Copy className="size-4" />
        </BotonNodo>
        <BotonNodo titulo="Eliminar" onClick={onEliminar} destructivo>
          <Trash2 className="size-4" />
        </BotonNodo>
      </div>

      {abierta && (
        <div className="border-t border-border p-3">
          {def.config.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Esta acción no necesita configuración.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {def.config.map((campo) => {
                const bruto = accion.config[campo.key];
                return (
                  <CampoDeConfig
                    key={campo.key}
                    id={`accion-${numero}-${campo.key}`}
                    campo={campo}
                    valor={bruto === undefined ? "" : String(bruto)}
                    stages={stages}
                    tags={tags}
                    usuarios={usuarios}
                    gruposTags={gruposTags}
                    clavesDisponibles={clavesDisponibles}
                    onChange={(valor) =>
                      onCambiar(
                        campo.key,
                        valor,
                        campo.type === "numero" || campo.type === "horas"
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BotonNodo({
  titulo,
  onClick,
  disabled,
  destructivo,
  children,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  destructivo?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      aria-label={titulo}
      className={cn(
        "rounded-lg p-1.5 text-muted-foreground transition-colors duration-150 disabled:opacity-30",
        destructivo
          ? "hover:bg-muted hover:text-destructive"
          : "hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/** Traduce el valor guardado a algo legible para el resumen del nodo. */
function valorLegible(
  campo: ActionDef["config"][number],
  valor: string,
  stages: StageOption[],
  tags: TagOption[],
  usuarios: UserOption[]
): string {
  switch (campo.type) {
    case "etapa":
      return stages.find((e) => e.id === valor)?.name ?? "etapa eliminada";
    case "etiqueta":
      return tags.find((t) => t.key === valor)?.label ?? valor;
    case "usuario":
      return usuarios.find((u) => u.id === valor)?.name ?? "sin asignar";
    case "lifecycle":
      return lifecycles.find((l) => l.value === valor)?.label ?? valor;
    case "horas":
      return `${valor} h`;
    case "texto_largo":
      return `“${recortar(valor)}”`;
    default:
      return recortar(valor);
  }
}

interface CampoDeConfigProps {
  id: string;
  campo: ActionDef["config"][number];
  valor: string;
  stages: StageOption[];
  tags: TagOption[];
  usuarios: UserOption[];
  gruposTags: { group: string; tags: { key: string; label: string }[] }[];
  clavesDisponibles: string[];
  onChange: (valor: string) => void;
}

/** Cada acción declara su configuración; acá se traduce a un control real. */
function CampoDeConfig({
  id,
  campo,
  valor,
  stages,
  tags,
  usuarios,
  gruposTags,
  clavesDisponibles,
  onChange,
}: CampoDeConfigProps) {
  let control: ReactNode;

  switch (campo.type) {
    case "etapa":
      control = (
        <Select
          id={id}
          value={valor}
          disabled={stages.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {stages.length === 0
              ? "No hay etapas configuradas"
              : "Selecciona una etapa"}
          </option>
          {stages.map((etapa) => (
            <option key={etapa.id} value={etapa.id}>
              {etapa.kind === "abierta"
                ? etapa.name
                : `${etapa.name} (${etapa.kind})`}
            </option>
          ))}
        </Select>
      );
      break;
    case "etiqueta":
      control = (
        <Select
          id={id}
          value={valor}
          disabled={tags.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {tags.length === 0
              ? "No hay etiquetas creadas"
              : "Selecciona una etiqueta"}
          </option>
          {tags.map((tag) => (
            <option key={tag.key} value={tag.key}>
              {tag.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "usuario":
      control = (
        <Select
          id={id}
          value={valor}
          disabled={usuarios.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">
            {usuarios.length === 0
              ? "No hay miembros en el equipo"
              : "Selecciona un responsable"}
          </option>
          {usuarios.map((usuario) => (
            <option key={usuario.id} value={usuario.id}>
              {usuario.name}
            </option>
          ))}
        </Select>
      );
      break;
    case "lifecycle":
      control = (
        <Select id={id} value={valor} onChange={(e) => onChange(e.target.value)}>
          <option value="">Selecciona una etapa</option>
          {lifecycles.map((opcion) => (
            <option key={opcion.value} value={opcion.value}>
              {opcion.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "horas":
      control = (
        <Input
          id={id}
          type="number"
          min={1}
          step={1}
          value={valor}
          placeholder="48"
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "numero":
      control = (
        <Input
          id={id}
          type="number"
          min={0}
          step={1}
          value={valor}
          placeholder="0"
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "texto_largo":
      control = (
        <>
          <Textarea
            id={id}
            rows={3}
            value={valor}
            onChange={(e) => onChange(e.target.value)}
          />
          <InsertadorDeVariables
            texto={valor}
            grupos={gruposTags}
            clavesDisponibles={clavesDisponibles}
            onInsertar={(clave) => onChange(`${valor}${envolver(clave)}`)}
          />
        </>
      );
      break;
    default:
      control = (
        <Input id={id} value={valor} onChange={(e) => onChange(e.target.value)} />
      );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5",
        campo.type === "texto_largo" && "sm:col-span-2"
      )}
    >
      <Label htmlFor={id}>
        {campo.label}
        {campo.required && <span className="text-destructive"> *</span>}
      </Label>
      {control}
      {campo.help && (
        <p className="text-xs text-muted-foreground">{campo.help}</p>
      )}
    </div>
  );
}

/** Chips de claves de fusión y aviso de variables inventadas. */
function InsertadorDeVariables({
  texto,
  grupos,
  clavesDisponibles,
  onInsertar,
}: {
  texto: string;
  grupos: { group: string; tags: { key: string; label: string }[] }[];
  clavesDisponibles: string[];
  onInsertar: (clave: string) => void;
}) {
  const desconocidas = tagsDesconocidas(texto, clavesDisponibles);

  return (
    <div className="flex flex-col gap-2">
      <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-muted/40 p-2">
        <div className="flex flex-col gap-2">
          {grupos.map((grupo) => (
            <div key={grupo.group} className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {grupo.group}
              </p>
              <div className="flex flex-wrap gap-1">
                {grupo.tags.map((tag) => (
                  <button
                    key={tag.key}
                    type="button"
                    onClick={() => onInsertar(tag.key)}
                    title={`Insertar ${envolver(tag.key)}`}
                    className="rounded-full border border-border bg-card px-2 py-0.5 text-xs text-muted-foreground transition-colors duration-150 hover:border-primary hover:text-primary"
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {desconocidas.length > 0 && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2 py-1.5 text-xs text-warning">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Variables que no existen: {desconocidas.join(", ")}. Se reemplazan
            por texto vacío al enviar.
          </span>
        </p>
      )}
    </div>
  );
}

function BotonEliminar({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();

  function eliminar() {
    if (
      !window.confirm(
        "¿Eliminar esta automatización? Se borra también su historial de ejecuciones."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await eliminarAutomatizacion(id);
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={eliminar}
      disabled={pending}
      className="text-destructive"
    >
      <Trash2 className="size-4" /> Eliminar
    </Button>
  );
}

/** Encendido y apagado desde el listado, sin abrir el constructor. */
export function ToggleAutomation({
  id,
  activa,
}: {
  id: string;
  activa: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function alternar() {
    startTransition(async () => {
      await alternarAutomatizacion(id, !activa);
    });
  }

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={alternar}
      disabled={pending}
    >
      {activa ? <Pause className="size-4" /> : <Play className="size-4" />}
      {activa ? "Pausar" : "Activar"}
    </Button>
  );
}

"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import {
  AlarmClock,
  Bell,
  Bot,
  BotOff,
  CalendarCheck,
  ChevronDown,
  ChevronUp,
  Clock,
  MessageSquare,
  MessageSquarePlus,
  MoveRight,
  Pause,
  Play,
  Plus,
  Send,
  Tag,
  TagsIcon,
  Target,
  Trash2,
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
  /** Automatización existente cuando se está editando */
  inicial?: AutomationRow | null;
}

function etiquetaCampo(campo: string): string {
  return camposLabels[campo] ?? campo;
}

function plural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function AutomationBuilder({
  stages,
  tags,
  usuarios,
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
  const [selectorAbierto, setSelectorAbierto] = useState(false);

  const trigger = getTrigger(triggerKind);
  const campos = trigger?.camposDisponibles ?? [];

  function elegirTrigger(kind: TriggerKind) {
    setTriggerKind(kind);
    // Los campos condicionables dependen del evento: las condiciones que ya
    // no aplican se descartan en vez de quedar apuntando a la nada.
    const disponibles = getTrigger(kind)?.camposDisponibles ?? [];
    setConditions((prev) => prev.filter((c) => disponibles.includes(c.campo)));
  }

  function agregarCondicion() {
    if (campos.length === 0) return;
    setConditions((prev) => [
      ...prev,
      { campo: campos[0], operador: "es", valor: "" },
    ]);
  }

  function actualizarCondicion(indice: number, cambio: Partial<Condition>) {
    setConditions((prev) =>
      prev.map((c, i) => (i === indice ? { ...c, ...cambio } : c))
    );
  }

  function quitarCondicion(indice: number) {
    setConditions((prev) => prev.filter((_, i) => i !== indice));
  }

  function agregarAccion(tipo: ActionKind) {
    setAcciones((prev) => [...prev, { tipo, config: {} }]);
    setSelectorAbierto(false);
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
    setAcciones((prev) => {
      const destino = indice + delta;
      if (destino < 0 || destino >= prev.length) return prev;
      const copia = [...prev];
      const [movida] = copia.splice(indice, 1);
      copia.splice(destino, 0, movida);
      return copia;
    });
  }

  function quitarAccion(indice: number) {
    setAcciones((prev) => prev.filter((_, i) => i !== indice));
  }

  const resumen = [
    `Cuando ${(trigger?.label ?? "ocurra el evento").toLowerCase()}`,
    conditions.length > 0
      ? `si se cumplen ${plural(conditions.length, "condición", "condiciones")}`
      : "sin condiciones",
    acciones.length > 0
      ? `entonces ${plural(acciones.length, "acción", "acciones")}`
      : "todavía sin acciones",
  ].join(", ");

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

      <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-name">Nombre</Label>
            <Input
              id="automation-name"
              name="name"
              required
              maxLength={80}
              defaultValue={inicial?.name ?? ""}
              placeholder="Ej: Lead nuevo de Instagram"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="automation-description">
              Descripción (opcional)
            </Label>
            <Input
              id="automation-description"
              name="description"
              maxLength={160}
              defaultValue={inicial?.description ?? ""}
              placeholder="Para qué sirve, en una línea"
            />
          </div>
        </div>
      </section>

      <Paso
        numero={1}
        titulo="Cuando pase esto"
        descripcion="El evento que enciende la regla. Solo uno por automatización."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {triggers.map((t) => {
            const Icono = ICONS[t.icon] ?? Zap;
            const activo = t.kind === triggerKind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => elegirTrigger(t.kind)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left transition-colors",
                  activo
                    ? "bg-primary/5 ring-2 ring-primary"
                    : "hover:bg-muted"
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
      </Paso>

      <Paso
        numero={2}
        titulo="Si se cumple"
        descripcion="Opcional. Todas las condiciones deben cumplirse."
      >
        <div className="flex flex-col gap-3">
          {conditions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin condiciones la automatización corre cada vez que ocurre el
              evento.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
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
                      {campos.map((campo) => (
                        <option key={campo} value={campo}>
                          {etiquetaCampo(campo)}
                        </option>
                      ))}
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
                          actualizarCondicion(indice, { valor: e.target.value })
                        }
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => quitarCondicion(indice)}
                      title="Eliminar condición"
                      className="justify-self-start rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={agregarCondicion}
              disabled={campos.length === 0}
            >
              <Plus className="size-4" /> Agregar condición
            </Button>
          </div>
        </div>
      </Paso>

      <Paso
        numero={3}
        titulo="Haz esto"
        descripcion="Las acciones corren en orden, una tras otra."
      >
        <div className="flex flex-col gap-3">
          {acciones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no hay acciones. Una automatización sin acciones no hace
              nada.
            </p>
          ) : (
            <ol className="flex flex-col gap-3">
              {acciones.map((accion, indice) => {
                const def = getAction(accion.tipo);
                if (!def) return null;
                const Icono = ICONS[def.icon] ?? Zap;
                return (
                  <li
                    key={indice}
                    className="rounded-lg border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                          {indice + 1}
                        </span>
                        <div>
                          <p className="flex items-center gap-2 text-sm font-medium">
                            <Icono className="size-4 text-primary" />
                            {def.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {def.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => moverAccion(indice, -1)}
                          disabled={indice === 0}
                          title="Subir"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronUp className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moverAccion(indice, 1)}
                          disabled={indice === acciones.length - 1}
                          title="Bajar"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                        >
                          <ChevronDown className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => quitarAccion(indice)}
                          title="Eliminar acción"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>

                    {def.config.length > 0 && (
                      <div className="mt-3 grid gap-3 pl-8 sm:grid-cols-2">
                        {def.config.map((campo) => {
                          const bruto = accion.config[campo.key];
                          return (
                            <CampoDeConfig
                              key={campo.key}
                              id={`accion-${indice}-${campo.key}`}
                              campo={campo}
                              valor={bruto === undefined ? "" : String(bruto)}
                              stages={stages}
                              tags={tags}
                              usuarios={usuarios}
                              onChange={(valor) =>
                                actualizarConfig(
                                  indice,
                                  campo.key,
                                  valor,
                                  campo.type === "numero" ||
                                    campo.type === "horas"
                                )
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}

          {selectorAbierto ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Elige una acción</p>
                <button
                  type="button"
                  onClick={() => setSelectorAbierto(false)}
                  title="Cerrar"
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogoAcciones.map((a) => {
                  const Icono = ICONS[a.icon] ?? Zap;
                  return (
                    <button
                      key={a.kind}
                      type="button"
                      onClick={() => agregarAccion(a.kind)}
                      className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted"
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
          ) : (
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSelectorAbierto(true)}
              >
                <Plus className="size-4" /> Agregar acción
              </Button>
            </div>
          )}
        </div>
      </Paso>

      <div className="sticky bottom-4 flex flex-col gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-medium">{resumen}.</p>
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
            {pending ? "Guardando…" : "Guardar automatización"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Paso({
  numero,
  titulo,
  descripcion,
  children,
}: {
  numero: number;
  titulo: string;
  descripcion: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {numero}
        </span>
        <div>
          <h2 className="text-base font-semibold">{titulo}</h2>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

interface CampoDeConfigProps {
  id: string;
  campo: ActionDef["config"][number];
  valor: string;
  stages: StageOption[];
  tags: TagOption[];
  usuarios: UserOption[];
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
        <Textarea
          id={id}
          rows={3}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
        />
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

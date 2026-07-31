"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Folder,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  claveDesdeEtiqueta,
  entityLabels,
  fieldTypeLabels,
  type FieldDef,
  type FieldEntity,
  type FieldType,
} from "@/lib/crm/custom-fields";
import { envolver, tagDeCampo } from "@/lib/crm/merge-tags";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import {
  actualizarCampo,
  crearCampo,
  eliminarCampo,
  moverCampo,
  type ActionState,
} from "./actions";

/** Fila tal como llega de custom_field_defs, con carpeta y fecha de creación. */
export interface FieldDefRow extends FieldDef {
  folder: string | null;
  created_at: string;
}

const initialState: ActionState = { error: null };

const tipos = Object.entries(fieldTypeLabels) as [FieldType, string][];
const entidades = Object.entries(entityLabels) as [FieldEntity, string][];

/**
 * Valor especial del filtro para los campos sin carpeta. Empieza con espacio:
 * las carpetas se guardan recortadas, así que ninguna real puede colisionar.
 */
const SIN_CARPETA = " sin";

/** La clave de fusión lista para pegar: {{contacto.cf.comuna}} */
function claveDeFusion(campo: Pick<FieldDef, "entity" | "key" | "label">): string {
  return envolver(tagDeCampo(campo).key);
}

export function FieldsTable({ campos }: { campos: FieldDefRow[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState<FieldType | "todos">("todos");
  const [carpetaFiltro, setCarpetaFiltro] = useState("todas");
  const [mostrarAlta, setMostrarAlta] = useState(campos.length === 0);
  const [editando, setEditando] = useState<string | null>(null);

  const cerrarAlta = useCallback(() => setMostrarAlta(false), []);
  const cerrarEdicion = useCallback(() => setEditando(null), []);

  const carpetas = useMemo(() => {
    const vistas = new Set<string>();
    for (const campo of campos) {
      if (campo.folder) vistas.add(campo.folder);
    }
    return [...vistas].sort((a, b) => a.localeCompare(b, "es"));
  }, [campos]);

  /** Primero y último de cada ficha: gobiernan los botones de orden. */
  const extremos = useMemo(() => {
    const porEntidad = new Map<FieldEntity, FieldDefRow[]>();
    for (const campo of campos) {
      const lista = porEntidad.get(campo.entity) ?? [];
      lista.push(campo);
      porEntidad.set(campo.entity, lista);
    }
    const mapa = new Map<string, { primero: boolean; ultimo: boolean }>();
    for (const lista of porEntidad.values()) {
      const ordenada = [...lista].sort((a, b) => a.position - b.position);
      ordenada.forEach((campo, indice) => {
        mapa.set(campo.id, {
          primero: indice === 0,
          ultimo: indice === ordenada.length - 1,
        });
      });
    }
    return mapa;
  }, [campos]);

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return campos.filter((campo) => {
      if (tipoFiltro !== "todos" && campo.field_type !== tipoFiltro) return false;
      if (carpetaFiltro !== "todas") {
        const carpeta = campo.folder ?? "";
        if (carpetaFiltro === SIN_CARPETA ? carpeta !== "" : carpeta !== carpetaFiltro) {
          return false;
        }
      }
      if (texto === "") return true;
      return (
        campo.label.toLowerCase().includes(texto) ||
        campo.key.toLowerCase().includes(texto)
      );
    });
  }, [campos, busqueda, tipoFiltro, carpetaFiltro]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o clave"
            className="pl-9"
            aria-label="Buscar campos"
          />
        </div>

        <Select
          value={tipoFiltro}
          onChange={(e) => setTipoFiltro(e.target.value as FieldType | "todos")}
          aria-label="Filtrar por tipo de campo"
          className="w-auto min-w-40"
        >
          <option value="todos">Todos los tipos</option>
          {tipos.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </Select>

        <Select
          value={carpetaFiltro}
          onChange={(e) => setCarpetaFiltro(e.target.value)}
          aria-label="Filtrar por carpeta"
          className="w-auto min-w-40"
        >
          <option value="todas">Todas las carpetas</option>
          <option value={SIN_CARPETA}>Sin carpeta</option>
          {carpetas.map((carpeta) => (
            <option key={carpeta} value={carpeta}>
              {carpeta}
            </option>
          ))}
        </Select>

        <span className="text-sm tabular-nums text-muted-foreground">
          {filtrados.length} {filtrados.length === 1 ? "campo" : "campos"}
        </span>

        <Button
          type="button"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setEditando(null);
            setMostrarAlta((abierto) => !abierto);
          }}
        >
          {mostrarAlta ? (
            <>
              <X className="size-4" /> Cerrar
            </>
          ) : (
            <>
              <Plus className="size-4" /> Crear campo
            </>
          )}
        </Button>
      </div>

      {mostrarAlta && <FormularioAlta carpetas={carpetas} onCerrar={cerrarAlta} />}

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full min-w-[52rem] border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  aria-label="Seleccionar todos los campos"
                  className="size-4 rounded border-border accent-primary"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Nombre del campo</th>
              <th className="px-3 py-2.5 font-medium">Tipo de campo</th>
              <th className="px-3 py-2.5 font-medium">Carpeta</th>
              <th className="px-3 py-2.5 font-medium">Clave</th>
              <th className="px-3 py-2.5 font-medium">Creado</th>
              <th className="px-3 py-2.5 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-10 text-center text-sm text-muted-foreground"
                >
                  {campos.length === 0
                    ? "Todavía no hay campos personalizados. Crea el primero con «Crear campo»."
                    : "Ningún campo calza con la búsqueda"}
                </td>
              </tr>
            )}

            {filtrados.map((campo) => {
              const orden = extremos.get(campo.id);
              const abierto = editando === campo.id;
              return (
                <FilaCampo
                  key={campo.id}
                  campo={campo}
                  carpetas={carpetas}
                  abierto={abierto}
                  esPrimero={orden?.primero ?? true}
                  esUltimo={orden?.ultimo ?? true}
                  onEditar={() => {
                    setMostrarAlta(false);
                    setEditando(abierto ? null : campo.id);
                  }}
                  onCerrar={cerrarEdicion}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface FilaCampoProps {
  campo: FieldDefRow;
  carpetas: string[];
  abierto: boolean;
  esPrimero: boolean;
  esUltimo: boolean;
  onEditar: () => void;
  onCerrar: () => void;
}

function FilaCampo({
  campo,
  carpetas,
  abierto,
  esPrimero,
  esUltimo,
  onEditar,
  onCerrar,
}: FilaCampoProps) {
  const [pendiente, iniciar] = useTransition();

  function mover(direccion: "arriba" | "abajo") {
    iniciar(async () => {
      await moverCampo(campo.id, direccion);
    });
  }

  function eliminar() {
    if (
      !window.confirm(
        `¿Eliminar «${campo.label}»? Dejará de aparecer en las fichas. Los datos ya guardados se conservan.`
      )
    ) {
      return;
    }
    iniciar(async () => {
      await eliminarCampo(campo.id);
    });
  }

  return (
    <>
      <tr
        className={cn(
          "border-b border-border transition-colors duration-150 last:border-0",
          abierto ? "bg-muted/40" : "hover:bg-muted/40",
          pendiente && "opacity-50"
        )}
      >
        <td className="px-3 py-2.5 align-top">
          <input
            type="checkbox"
            aria-label={`Seleccionar ${campo.label}`}
            className="mt-0.5 size-4 rounded border-border accent-primary"
          />
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="text-sm font-medium">
            {campo.label}
            {campo.required && (
              <span className="ml-1 text-destructive" title="Obligatorio">
                *
              </span>
            )}
          </div>
          {campo.help && (
            <p className="text-xs text-muted-foreground">{campo.help}</p>
          )}
        </td>
        <td className="px-3 py-2.5 align-top text-sm text-muted-foreground">
          {fieldTypeLabels[campo.field_type]}
        </td>
        <td className="px-3 py-2.5 align-top">
          {campo.folder ? (
            <Badge variant="outline" className="gap-1">
              <Folder className="size-3" />
              {campo.folder}
            </Badge>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center gap-1.5">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              {claveDeFusion(campo)}
            </code>
            <BotonCopiar valor={claveDeFusion(campo)} />
          </div>
        </td>
        <td className="px-3 py-2.5 align-top text-sm tabular-nums text-muted-foreground">
          {formatDate(campo.created_at)}
        </td>
        <td className="px-3 py-2.5 align-top">
          <div className="flex items-center justify-end gap-0.5">
            <BotonIcono
              title={abierto ? "Cerrar edición" : "Editar campo"}
              onClick={onEditar}
              disabled={pendiente}
            >
              <Pencil className="size-4" />
            </BotonIcono>
            <BotonIcono
              title="Subir"
              onClick={() => mover("arriba")}
              disabled={pendiente || esPrimero}
            >
              <ChevronUp className="size-4" />
            </BotonIcono>
            <BotonIcono
              title="Bajar"
              onClick={() => mover("abajo")}
              disabled={pendiente || esUltimo}
            >
              <ChevronDown className="size-4" />
            </BotonIcono>
            <BotonIcono
              title="Eliminar campo"
              onClick={eliminar}
              disabled={pendiente}
              destructivo
            >
              <Trash2 className="size-4" />
            </BotonIcono>
          </div>
        </td>
      </tr>

      {abierto && (
        <tr className="border-b border-border bg-muted/20 last:border-0">
          <td colSpan={7} className="px-3 py-4">
            <FormularioEdicion
              campo={campo}
              carpetas={carpetas}
              onCerrar={onCerrar}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function BotonIcono({
  title,
  onClick,
  disabled,
  destructivo,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  destructivo?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg p-1.5 text-muted-foreground transition-colors duration-150",
        "hover:bg-muted disabled:pointer-events-none disabled:opacity-30",
        destructivo ? "hover:text-destructive" : "hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function BotonCopiar({ valor }: { valor: string }) {
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    []
  );

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
    } catch {
      return;
    }
    setCopiado(true);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <button
      type="button"
      title="Copiar clave"
      aria-label="Copiar clave"
      onClick={copiar}
      className="rounded-lg p-1 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
    >
      {copiado ? (
        <Check className="size-3.5 text-success" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </button>
  );
}

function FormularioAlta({
  carpetas,
  onCerrar,
}: {
  carpetas: string[];
  onCerrar: () => void;
}) {
  const [state, formAction, pendiente] = useActionState(crearCampo, initialState);
  const [etiqueta, setEtiqueta] = useState("");
  const [entidad, setEntidad] = useState<FieldEntity>("contacto");
  const [tipo, setTipo] = useState<FieldType>("texto");
  const formRef = useRef<HTMLFormElement>(null);

  const alGuardar = useCallback(() => {
    setEtiqueta("");
    setTipo("texto");
    onCerrar();
  }, [onCerrar]);
  useResetOnSuccess(state, formRef, alGuardar);

  const clave = claveDesdeEtiqueta(etiqueta);
  const vistaPrevia = clave
    ? claveDeFusion({ entity: entidad, key: clave, label: etiqueta })
    : "—";

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
    >
      <div>
        <h2 className="text-sm font-semibold">Nuevo campo</h2>
        <p className="text-xs text-muted-foreground">
          Aparecerá en cada ficha y quedará disponible para filtros,
          automatizaciones y mensajes.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alta-label">Nombre del campo</Label>
          <Input
            id="alta-label"
            name="label"
            required
            maxLength={60}
            placeholder="Ej: Comuna de despacho"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Clave de fusión:{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {vistaPrevia}
            </code>
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alta-entity">Ficha</Label>
          <Select
            id="alta-entity"
            name="entity"
            value={entidad}
            onChange={(e) => setEntidad(e.target.value as FieldEntity)}
          >
            {entidades.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alta-type">Tipo de campo</Label>
          <Select
            id="alta-type"
            name="field_type"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as FieldType)}
          >
            {tipos.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alta-folder">Carpeta (opcional)</Label>
          <Input
            id="alta-folder"
            name="folder"
            list="carpetas-existentes"
            maxLength={60}
            placeholder="Ej: Despacho"
          />
          <datalist id="carpetas-existentes">
            {carpetas.map((carpeta) => (
              <option key={carpeta} value={carpeta} />
            ))}
          </datalist>
        </div>
      </div>

      {tipo === "seleccion" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="alta-options">Opciones</Label>
          <Textarea
            id="alta-options"
            name="options"
            rows={4}
            placeholder={"Una opción por línea\nSantiago\nValparaíso"}
          />
          <p className="text-xs text-muted-foreground">
            Una opción por línea. Se necesitan al menos dos.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="alta-help">Texto de ayuda (opcional)</Label>
        <Input
          id="alta-help"
          name="help"
          maxLength={120}
          placeholder="Aparece bajo el campo al llenar la ficha"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="required"
          className="size-4 rounded border-border accent-primary"
        />
        Obligatorio al guardar la ficha
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? "Creando…" : "Crear campo"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

function FormularioEdicion({
  campo,
  carpetas,
  onCerrar,
}: {
  campo: FieldDefRow;
  carpetas: string[];
  onCerrar: () => void;
}) {
  const [state, formAction, pendiente] = useActionState(
    actualizarCampo,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef, onCerrar);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="id" value={campo.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`edit-label-${campo.id}`}>Nombre del campo</Label>
          <Input
            id={`edit-label-${campo.id}`}
            name="label"
            required
            maxLength={60}
            defaultValue={campo.label}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`edit-folder-${campo.id}`}>Carpeta</Label>
          <Input
            id={`edit-folder-${campo.id}`}
            name="folder"
            list={`carpetas-${campo.id}`}
            maxLength={60}
            defaultValue={campo.folder ?? ""}
            placeholder="Sin carpeta"
          />
          <datalist id={`carpetas-${campo.id}`}>
            {carpetas.map((carpeta) => (
              <option key={carpeta} value={carpeta} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-key-${campo.id}`}>Clave de fusión</Label>
        <Input
          id={`edit-key-${campo.id}`}
          value={claveDeFusion(campo)}
          readOnly
          className="font-mono text-xs text-muted-foreground"
        />
        <p className="text-xs text-muted-foreground">
          La clave no cambia aunque renombres el campo, para no perder los datos
          ya guardados.
        </p>
      </div>

      {campo.field_type === "seleccion" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`edit-options-${campo.id}`}>Opciones</Label>
          <Textarea
            id={`edit-options-${campo.id}`}
            name="options"
            rows={4}
            defaultValue={campo.options.join("\n")}
          />
          <p className="text-xs text-muted-foreground">
            Una opción por línea. Se necesitan al menos dos.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`edit-help-${campo.id}`}>Texto de ayuda</Label>
        <Input
          id={`edit-help-${campo.id}`}
          name="help"
          maxLength={120}
          defaultValue={campo.help ?? ""}
          placeholder="Aparece bajo el campo al llenar la ficha"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="required"
          defaultChecked={campo.required}
          className="size-4 rounded border-border accent-primary"
        />
        Obligatorio al guardar la ficha
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pendiente}>
          {pendiente ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCerrar}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

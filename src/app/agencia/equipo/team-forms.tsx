"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronsUpDown,
  Copy,
  Link2,
  LogOut,
  Search,
  TriangleAlert,
  UserMinus,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import type { MiembroAgencia } from "@/lib/agency/types";
import {
  invitarAlEquipo,
  quitarDelEquipo,
  revocarInvitacion,
  type EstadoAccion,
  type EstadoInvitacion,
} from "./actions";

type Rol = MiembroAgencia["role"];

/** Fila de la tabla del equipo: las fechas ya vienen resueltas del servidor */
export interface FilaMiembro {
  userId: string;
  nombre: string;
  correo: string;
  rol: Rol;
  rolEtiqueta: string;
  desde: string;
  /** Epoch de ingreso, para ordenar por antigüedad */
  desdeMs: number;
  antiguedad: string;
  esTu: boolean;
  /** Movimientos que registró en la bitácora dentro de la ventana */
  cambios: number;
  ultimoCambio: string | null;
}

export type EstadoInvitacionFila =
  | "pendiente"
  | "vencida"
  | "aceptada"
  | "revocada";

/** Fila de la tabla de invitaciones */
export interface FilaInvitacion {
  id: string;
  token: string;
  correo: string;
  rolEtiqueta: string;
  estado: EstadoInvitacionFila;
  creada: string;
  creadaMs: number;
  vence: string;
  venceRelativo: string;
}

const INICIAL_INVITACION: EstadoInvitacion = { error: null, creada: null };
const INICIAL_ACCION: EstadoAccion = { error: null };

/**
 * A partir de este tamaño el equipo deja de leerse de un vistazo y aparecen
 * buscador y filtros. Con dos personas serían tres controles para nada.
 */
const UMBRAL_HERRAMIENTAS = 5;

const etiquetaRol: Record<Rol, string> = {
  owner: "Dueño",
  admin: "Administrador",
};

/** Lo que cada rol puede hacer de verdad, según lo que validan las RPC */
const alcanceRol: Record<Rol, string> = {
  owner:
    "Entra a todas las subcuentas y además invita, quita gente y edita los datos de la agencia.",
  admin:
    "Entra a todas las subcuentas como administrador, las crea y aplica plantillas. No toca el equipo.",
};

const varianteEstado: Record<
  EstadoInvitacionFila,
  "default" | "warning" | "success" | "outline"
> = {
  pendiente: "default",
  vencida: "warning",
  aceptada: "success",
  revocada: "outline",
};

const etiquetaEstado: Record<EstadoInvitacionFila, string> = {
  pendiente: "Esperando",
  vencida: "Vencida",
  aceptada: "Aceptada",
  revocada: "Revocada",
};

/** El origen no cambia mientras la pestaña vive: no hay a qué suscribirse */
const sinCambios = () => () => {};

const origenDelNavegador = () => window.location.origin;

/** En el servidor no existe origen: se pinta la ruta y se completa al hidratar */
const origenEnServidor = () => "";

/**
 * Dominio desde el que se está mirando el panel.
 *
 * El enlace de invitación tiene que apuntar a ese mismo origen (producción,
 * pruebas o localhost); leerlo como store externo evita que el HTML del
 * servidor y el del navegador difieran.
 */
function useOrigen(): string {
  return useSyncExternalStore(
    sinCambios,
    origenDelNavegador,
    origenEnServidor
  );
}

type EstadoCopia = "listo" | "copiado" | "error";

function useCopiado(): {
  estado: EstadoCopia;
  copiar: (texto: string) => Promise<void>;
} {
  const [estado, setEstado] = useState<EstadoCopia>("listo");

  useEffect(() => {
    if (estado === "listo") return;
    const id = setTimeout(() => setEstado("listo"), 2500);
    return () => clearTimeout(id);
  }, [estado]);

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("copiado");
    } catch {
      // Sin HTTPS o sin permiso no existe portapapeles: se avisa para que
      // la persona seleccione el enlace a mano en vez de quedarse esperando.
      setEstado("error");
    }
  };

  return { estado, copiar };
}

function BotonCopiar({
  texto,
  etiqueta = "Copiar enlace",
  className,
}: {
  texto: string;
  etiqueta?: string;
  className?: string;
}) {
  const { estado, copiar } = useCopiado();
  return (
    <button
      type="button"
      onClick={() => void copiar(texto)}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted",
        estado === "error" && "border-destructive/50 text-destructive",
        className
      )}
    >
      {estado === "copiado" ? (
        <>
          <Check className="size-3.5 text-success" /> Copiado
        </>
      ) : estado === "error" ? (
        <>
          <TriangleAlert className="size-3.5" /> Cópialo a mano
        </>
      ) : (
        <>
          <Copy className="size-3.5" /> {etiqueta}
        </>
      )}
    </button>
  );
}

/** Panel del enlace recién creado: es lo único que la persona recibe */
function EnlaceCreado({
  token,
  correo,
  rol,
}: {
  token: string;
  correo: string;
  rol: Rol;
}) {
  const origen = useOrigen();
  const url = `${origen}/invitacion/${token}`;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-success/40 bg-success/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link2 className="size-4 shrink-0 text-success" />
        <p className="text-sm font-medium">Enlace listo para {correo}</p>
        <Badge variant="outline">{etiquetaRol[rol]}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
          {url}
        </code>
        <BotonCopiar texto={url} />
      </div>
      <p className="text-xs text-muted-foreground">
        Nadie recibe un correo: mándaselo tú por WhatsApp o correo. Sirve una
        sola vez y vence en 14 días; hasta que lo abran, la invitación queda
        más abajo en la tabla.
      </p>
    </div>
  );
}

/** Formulario de invitación. Solo se pinta para el dueño de la agencia. */
export function FormularioInvitacion() {
  const [estado, accion, pendiente] = useActionState(
    invitarAlEquipo,
    INICIAL_INVITACION
  );
  const [rol, setRol] = useState<Rol>("admin");
  const formRef = useRef<HTMLFormElement>(null);
  // El <select> es controlado: si solo se reseteara el formulario, el DOM
  // volvería a "Administrador" mientras el estado seguiría en el rol anterior.
  const volverAlRolPorDefecto = useCallback(() => setRol("admin"), []);
  useResetOnSuccess(estado, formRef, volverAlRolPorDefecto);

  return (
    <div className="flex flex-col gap-3">
      <form
        ref={formRef}
        action={accion}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor="invitacion-correo">Correo de la persona</Label>
          <Input
            id="invitacion-correo"
            name="email"
            type="email"
            required
            autoComplete="off"
            placeholder="socio@tuagencia.cl"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-52">
          <Label htmlFor="invitacion-rol">Rol en la agencia</Label>
          <Select
            id="invitacion-rol"
            name="role"
            value={rol}
            onChange={(evento) =>
              setRol(evento.target.value === "owner" ? "owner" : "admin")
            }
          >
            <option value="admin">{etiquetaRol.admin}</option>
            <option value="owner">{etiquetaRol.owner}</option>
          </Select>
        </div>
        <Button type="submit" disabled={pendiente}>
          <UserPlus className="size-4" />
          {pendiente ? "Creando enlace…" : "Crear enlace"}
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">{alcanceRol[rol]}</p>

      {estado.error && (
        <p className="text-sm text-destructive" aria-live="polite">
          {estado.error}
        </p>
      )}

      {estado.creada && (
        <EnlaceCreado
          token={estado.creada.token}
          correo={estado.creada.correo}
          rol={estado.creada.rol}
        />
      )}
    </div>
  );
}

type ColumnaEquipo = "persona" | "rol" | "desde" | "cambios";
type Direccion = "asc" | "desc";
type FiltroRol = "todos" | Rol;

function compararMiembros(
  a: FilaMiembro,
  b: FilaMiembro,
  columna: ColumnaEquipo
): number {
  switch (columna) {
    case "persona":
      return a.nombre.localeCompare(b.nombre, "es");
    // El dueño manda sobre el administrador, así que encabeza el orden
    case "rol":
      return (a.rol === "owner" ? 0 : 1) - (b.rol === "owner" ? 0 : 1);
    case "desde":
      return a.desdeMs - b.desdeMs;
    case "cambios":
      return a.cambios - b.cambios;
  }
}

export function TablaEquipo({
  filas,
  esDueno,
  conBitacora,
}: {
  filas: FilaMiembro[];
  esDueno: boolean;
  /** La columna de movimientos solo aparece si la agencia tiene bitácora */
  conBitacora: boolean;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<FiltroRol>("todos");
  const [columna, setColumna] = useState<ColumnaEquipo>("rol");
  const [direccion, setDireccion] = useState<Direccion>("asc");

  const conteos = useMemo(
    () => ({
      todos: filas.length,
      owner: filas.filter((f) => f.rol === "owner").length,
      admin: filas.filter((f) => f.rol === "admin").length,
    }),
    [filas]
  );

  const visibles = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return filas
      .filter((f) => {
        if (filtro !== "todos" && f.rol !== filtro) return false;
        if (!termino) return true;
        return `${f.nombre} ${f.correo}`.toLowerCase().includes(termino);
      })
      .sort((a, b) => {
        const orden = compararMiembros(a, b, columna);
        if (orden !== 0) return direccion === "asc" ? orden : -orden;
        return a.nombre.localeCompare(b.nombre, "es");
      });
  }, [filas, busqueda, filtro, columna, direccion]);

  const ordenar = (destino: ColumnaEquipo) => {
    if (destino === columna) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
      return;
    }
    setColumna(destino);
    setDireccion(destino === "cambios" || destino === "desde" ? "desc" : "asc");
  };

  const columnas = 4 + (conBitacora ? 1 : 0) + (esDueno ? 1 : 0);
  const conHerramientas = filas.length >= UMBRAL_HERRAMIENTAS;

  return (
    <div className="flex flex-col gap-3">
      {conHerramientas && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              className="pl-9"
              placeholder="Buscar por nombre o correo"
              aria-label="Buscar en el equipo"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { valor: "todos", etiqueta: "Todos", total: conteos.todos },
                { valor: "owner", etiqueta: "Dueños", total: conteos.owner },
                {
                  valor: "admin",
                  etiqueta: "Administradores",
                  total: conteos.admin,
                },
              ] as { valor: FiltroRol; etiqueta: string; total: number }[]
            ).map((chip) => (
              <button
                key={chip.valor}
                type="button"
                onClick={() => setFiltro(chip.valor)}
                aria-pressed={filtro === chip.valor}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                  filtro === chip.valor
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                  chip.total === 0 && filtro !== chip.valor && "opacity-50"
                )}
              >
                {chip.etiqueta}
                <span className="ml-1.5 tabular-nums">{chip.total}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {visibles.length === filas.length
              ? `${filas.length} personas`
              : `${visibles.length} de ${filas.length}`}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">
                  <EncabezadoOrden
                    etiqueta="Persona"
                    destino="persona"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Correo</th>
                <th className="px-4 py-2.5 font-medium">
                  <EncabezadoOrden
                    etiqueta="Rol"
                    destino="rol"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">
                  <EncabezadoOrden
                    etiqueta="En el equipo desde"
                    destino="desde"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                {conBitacora && (
                  <th
                    className="px-4 py-2.5 text-right font-medium"
                    title="Subcuentas y plantillas que creó o modificó en los últimos 30 días"
                  >
                    <EncabezadoOrden
                      etiqueta="Movimientos 30 d"
                      destino="cambios"
                      columna={columna}
                      direccion={direccion}
                      onOrdenar={ordenar}
                      alineado="derecha"
                    />
                  </th>
                )}
                {esDueno && (
                  <th className="px-4 py-2.5 text-right font-medium">Acceso</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={columnas} className="px-4 py-10 text-center">
                    <p className="text-sm font-medium">
                      Nadie calza con ese filtro
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setBusqueda("");
                        setFiltro("todos");
                      }}
                      className="mt-2 text-sm font-medium text-primary hover:underline"
                    >
                      Ver a todo el equipo
                    </button>
                  </td>
                </tr>
              ) : (
                visibles.map((fila) => (
                  <tr
                    key={fila.userId}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {(fila.nombre || fila.correo)
                            .charAt(0)
                            .toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {fila.nombre}
                            {fila.esTu && (
                              <span className="font-normal text-muted-foreground">
                                {" "}
                                (tú)
                              </span>
                            )}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {fila.antiguedad}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <a
                        href={`mailto:${fila.correo}`}
                        className="hover:underline"
                      >
                        {fila.correo}
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant={fila.rol === "owner" ? "default" : "outline"}
                      >
                        {fila.rolEtiqueta}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {fila.desde}
                    </td>
                    {conBitacora && (
                      <td className="px-4 py-2.5 text-right align-top tabular-nums">
                        {fila.cambios === 0 ? (
                          <span className="text-muted-foreground">0</span>
                        ) : (
                          <>
                            {fila.cambios}
                            {fila.ultimoCambio && (
                              <span className="block text-xs text-muted-foreground">
                                {fila.ultimoCambio}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    )}
                    {esDueno && (
                      <td className="px-4 py-2.5 text-right">
                        <QuitarMiembro fila={fila} />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/**
 * Quitar a alguien no tiene deshacer: el botón pide confirmación en el
 * mismo lugar en vez de abrir un diálogo que se cierra por reflejo.
 */
function QuitarMiembro({ fila }: { fila: FilaMiembro }) {
  const [estado, accion, pendiente] = useActionState(
    quitarDelEquipo,
    INICIAL_ACCION
  );
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
        >
          {fila.esTu ? (
            <>
              <LogOut className="size-3.5" /> Salir de la agencia
            </>
          ) : (
            <>
              <UserMinus className="size-3.5" /> Quitar acceso
            </>
          )}
        </button>
        {estado.error && (
          <p className="max-w-[18rem] text-right text-xs text-destructive">
            {estado.error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form action={accion} className="flex flex-col items-end gap-1">
      <input type="hidden" name="user_id" value={fila.userId} />
      <p className="max-w-[20rem] text-right text-xs text-muted-foreground">
        {fila.esTu
          ? "Perderás el panel de la agencia y el acceso a todas sus subcuentas."
          : `${fila.nombre} dejará de entrar al panel y a todas las subcuentas.`}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pendiente}
          className={buttonClasses(
            "destructive",
            "sm",
            "h-auto px-2.5 py-1.5 text-xs"
          )}
        >
          {pendiente ? "Quitando…" : "Sí, quitar"}
        </button>
      </div>
      {estado.error && (
        <p className="max-w-[20rem] text-right text-xs text-destructive">
          {estado.error}
        </p>
      )}
    </form>
  );
}

type ColumnaInvitacion = "correo" | "creada" | "vence";

function compararInvitaciones(
  a: FilaInvitacion,
  b: FilaInvitacion,
  columna: ColumnaInvitacion
): number {
  switch (columna) {
    case "correo":
      return a.correo.localeCompare(b.correo, "es");
    case "creada":
      return a.creadaMs - b.creadaMs;
    // Vence y creada corren juntas: el orden por vencimiento es el mismo
    case "vence":
      return a.creadaMs - b.creadaMs;
  }
}

export function TablaInvitaciones({
  filas,
  esDueno,
}: {
  filas: FilaInvitacion[];
  esDueno: boolean;
}) {
  // Lo urgente son los enlaces que alguien todavía puede usar; si no queda
  // ninguno vivo, abrir en un filtro vacío sería esconder el historial.
  const [filtro, setFiltro] = useState<EstadoInvitacionFila | "todas">(() =>
    filas.some((f) => f.estado === "pendiente") ? "pendiente" : "todas"
  );
  const [columna, setColumna] = useState<ColumnaInvitacion>("creada");
  const [direccion, setDireccion] = useState<Direccion>("desc");

  const conteos = useMemo(() => {
    const acc: Record<EstadoInvitacionFila | "todas", number> = {
      todas: filas.length,
      pendiente: 0,
      vencida: 0,
      aceptada: 0,
      revocada: 0,
    };
    for (const f of filas) acc[f.estado] += 1;
    return acc;
  }, [filas]);

  const visibles = useMemo(
    () =>
      filas
        .filter((f) => filtro === "todas" || f.estado === filtro)
        .sort((a, b) => {
          const orden = compararInvitaciones(a, b, columna);
          return direccion === "asc" ? orden : -orden;
        }),
    [filas, filtro, columna, direccion]
  );

  const ordenar = (destino: ColumnaInvitacion) => {
    if (destino === columna) {
      setDireccion(direccion === "asc" ? "desc" : "asc");
      return;
    }
    setColumna(destino);
    setDireccion(destino === "correo" ? "asc" : "desc");
  };

  const chips: { valor: EstadoInvitacionFila | "todas"; etiqueta: string }[] = [
    { valor: "pendiente", etiqueta: "Esperando" },
    { valor: "vencida", etiqueta: "Vencidas" },
    { valor: "aceptada", etiqueta: "Aceptadas" },
    { valor: "revocada", etiqueta: "Revocadas" },
    { valor: "todas", etiqueta: "Todas" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {chips
          // Un filtro que no puede devolver nada solo estorba
          .filter((chip) => conteos[chip.valor] > 0 || filtro === chip.valor)
          .map((chip) => (
            <button
              key={chip.valor}
              type="button"
              onClick={() => setFiltro(chip.valor)}
              aria-pressed={filtro === chip.valor}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                filtro === chip.valor
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {chip.etiqueta}
              <span className="ml-1.5 tabular-nums">{conteos[chip.valor]}</span>
            </button>
          ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">
                  <EncabezadoOrden
                    etiqueta="Correo invitado"
                    destino="correo"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">Rol que tendrá</th>
                <th className="px-4 py-2.5 font-medium">Estado</th>
                <th className="px-4 py-2.5 font-medium">
                  <EncabezadoOrden
                    etiqueta="Creada"
                    destino="creada"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 font-medium">
                  <EncabezadoOrden
                    etiqueta="Vence"
                    destino="vence"
                    columna={columna}
                    direccion={direccion}
                    onOrdenar={ordenar}
                  />
                </th>
                <th className="px-4 py-2.5 text-right font-medium">Enlace</th>
              </tr>
            </thead>
            <tbody>
              {visibles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <p className="text-sm font-medium">
                      Ninguna invitación en ese estado
                    </p>
                    <button
                      type="button"
                      onClick={() => setFiltro("todas")}
                      className="mt-2 text-sm font-medium text-primary hover:underline"
                    >
                      Ver todas
                    </button>
                  </td>
                </tr>
              ) : (
                visibles.map((fila) => (
                  <FilaDeInvitacion
                    key={fila.id}
                    fila={fila}
                    esDueno={esDueno}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FilaDeInvitacion({
  fila,
  esDueno,
}: {
  fila: FilaInvitacion;
  esDueno: boolean;
}) {
  const [estado, accion, pendiente] = useActionState(
    revocarInvitacion,
    INICIAL_ACCION
  );
  const origen = useOrigen();
  const url = `${origen}/invitacion/${fila.token}`;

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/50">
      <td className="px-4 py-2.5 font-medium">{fila.correo}</td>
      <td className="px-4 py-2.5">{fila.rolEtiqueta}</td>
      <td className="px-4 py-2.5">
        <Badge variant={varianteEstado[fila.estado]}>
          {etiquetaEstado[fila.estado]}
        </Badge>
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
        {fila.creada}
      </td>
      <td className="px-4 py-2.5 whitespace-nowrap">
        <span className="tabular-nums">{fila.vence}</span>
        <span
          className={cn(
            "block text-xs",
            fila.estado === "vencida"
              ? "text-warning"
              : "text-muted-foreground"
          )}
        >
          {fila.venceRelativo}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center justify-end gap-1.5">
            {fila.estado === "pendiente" ? (
              <BotonCopiar texto={url} />
            ) : (
              <span className="text-xs text-muted-foreground">
                {fila.estado === "vencida"
                  ? "El enlace ya no sirve"
                  : "Enlace consumido"}
              </span>
            )}
            {esDueno &&
              (fila.estado === "pendiente" || fila.estado === "vencida") && (
                <form action={accion}>
                  <input
                    type="hidden"
                    name="invitation_id"
                    value={fila.id}
                  />
                  <button
                    type="submit"
                    disabled={pendiente}
                    className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                  >
                    {pendiente ? "Revocando…" : "Revocar"}
                  </button>
                </form>
              )}
          </div>
          {estado.error && (
            <p className="max-w-[18rem] text-right text-xs text-destructive">
              {estado.error}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

function EncabezadoOrden<T extends string>({
  etiqueta,
  destino,
  columna,
  direccion,
  onOrdenar,
  alineado = "izquierda",
}: {
  etiqueta: string;
  destino: T;
  columna: T;
  direccion: Direccion;
  onOrdenar: (destino: T) => void;
  alineado?: "izquierda" | "derecha";
}) {
  const activa = columna === destino;
  const Icono = !activa
    ? ChevronsUpDown
    : direccion === "asc"
      ? ArrowUp
      : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onOrdenar(destino)}
      aria-label={`Ordenar por ${etiqueta}`}
      className={cn(
        "group inline-flex w-full items-center gap-1 whitespace-nowrap transition-colors hover:text-foreground",
        alineado === "derecha" && "justify-end",
        activa && "text-foreground"
      )}
    >
      {etiqueta}
      <Icono
        className={cn(
          "size-3 shrink-0 transition-opacity",
          activa ? "opacity-100" : "opacity-0 group-hover:opacity-60"
        )}
      />
    </button>
  );
}

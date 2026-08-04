"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CircleCheck,
  Clock,
  MessageSquareText,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { formatFechaHora, type ConfigRegional } from "@/lib/locale";
import { sincronizarConMeta, type EstadoSincronizacion } from "./actions";

/** Una fila de message_templates tal como la lee la página */
export interface PlantillaFila {
  id: string;
  name: string;
  language: string;
  category: string | null;
  /** Estado EN META. La columna es texto libre: se lee sin asumir el valor. */
  status: string;
  body: string;
  variables: number;
  external_id: string | null;
  synced_at: string | null;
}

type VarianteBadge = "default" | "success" | "warning" | "destructive" | "outline";

interface DescripcionEstado {
  etiqueta: string;
  variante: VarianteBadge;
  /** Qué significa para poder enviarla; es lo único que le importa a quien mira */
  consecuencia: string;
  /** Orden en la lista: primero lo que sí se puede usar */
  rango: number;
}

const ESTADOS: Record<string, DescripcionEstado> = {
  aprobada: {
    etiqueta: "Aprobada",
    variante: "success",
    consecuencia: "Se puede enviar para iniciar una conversación.",
    rango: 0,
  },
  pendiente: {
    etiqueta: "En revisión",
    variante: "warning",
    consecuencia:
      "Meta todavía la está revisando. Hasta que la apruebe, el envío se rechaza.",
    rango: 1,
  },
  pausada: {
    etiqueta: "Pausada",
    variante: "outline",
    consecuencia:
      "Meta la pausó por calidad baja (mucha gente la reportó o la bloqueó). No se puede enviar hasta que se reactive.",
    rango: 2,
  },
  rechazada: {
    etiqueta: "Rechazada",
    variante: "destructive",
    consecuencia:
      "Meta la rechazó. Hay que corregirla y volver a enviarla a revisión desde el panel de Meta.",
    rango: 3,
  },
};

/**
 * Un estado que no conocemos se muestra tal como vino.
 *
 * Meta agrega estados nuevos sin avisar; mapearlo a "pendiente" mostraría
 * un badge amarillo tranquilizador sobre algo que no sabemos qué es.
 */
function describirEstado(status: string): DescripcionEstado {
  return (
    ESTADOS[status] ?? {
      etiqueta: status || "Sin estado",
      variante: "outline",
      consecuencia:
        "Meta reportó un estado que todavía no sabemos interpretar. Revísala en el panel de Meta antes de usarla.",
      rango: 4,
    }
  );
}

/** Categorías de Meta; las que no reconocemos se muestran como vinieron */
const CATEGORIAS: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utilidad",
  AUTHENTICATION: "Autenticación",
};

/** Códigos de idioma frecuentes; el código igual se muestra porque es parte de la llave */
const IDIOMAS: Record<string, string> = {
  es: "Español",
  es_AR: "Español (Argentina)",
  es_ES: "Español (España)",
  es_MX: "Español (México)",
  en: "Inglés",
  en_US: "Inglés (EE. UU.)",
  pt_BR: "Portugués (Brasil)",
};

/** Sin región no hay cómo formatear la hora sin mentir sobre el huso */
function cuando(
  valor: string | null | undefined,
  region: ConfigRegional | null
): string | null {
  if (!valor || !region) return null;
  return formatFechaHora(valor, region);
}

/**
 * Ventana para decidir si dos filas vienen de la misma sincronización.
 *
 * sincronizarPlantillas() calcula el synced_at por fila, así que un lote
 * grande puede quedar partido en milisegundos distintos. Como entre dos
 * sincronizaciones reales pasan minutos u horas, agrupar por proximidad
 * es exacto en la práctica y no depende de un timestamp común.
 */
const VENTANA_MISMO_LOTE_MS = 2 * 60 * 1000;

function marcaTiempo(valor: string | null): number | null {
  if (!valor) return null;
  const ms = Date.parse(valor);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Plantillas que no vinieron en la última sincronización.
 *
 * La sincronización agrega y actualiza, pero nunca borra: una plantilla que
 * el cliente eliminó en Meta seguiría acá con su último estado conocido.
 * Mostrarla como si existiera es prometer un envío que Meta va a rechazar.
 */
function idsFueraDelUltimoLote(plantillas: PlantillaFila[]): Set<string> {
  const fuera = new Set<string>();
  const marcas = plantillas
    .map((p) => marcaTiempo(p.synced_at))
    .filter((ms): ms is number => ms !== null);
  if (marcas.length === 0) return fuera;

  const ultima = Math.max(...marcas);
  for (const plantilla of plantillas) {
    const ms = marcaTiempo(plantilla.synced_at);
    // Sin fecha no se puede afirmar nada: no se marca.
    if (ms === null) continue;
    if (ultima - ms > VENTANA_MISMO_LOTE_MS) fuera.add(plantilla.id);
  }
  return fuera;
}

/** Solo los {{n}} numerados: son los que Meta reemplaza al enviar */
const PLACEHOLDER_SEPARADOR = /(\{\{\s*\d+\s*\}\})/g;
const PLACEHOLDER_EXACTO = /^\{\{\s*\d+\s*\}\}$/;

/**
 * El cuerpo tal cual lo aprobó Meta, con los huecos a la vista.
 *
 * Sin resaltarlos, "Hola {{1}}, tu pedido {{2}} está listo" se lee como
 * texto raro; resaltados se entiende de una que hay que llenar dos datos.
 */
function CuerpoResaltado({ cuerpo }: { cuerpo: string }) {
  if (!cuerpo.trim()) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Meta no devolvió el texto del cuerpo de esta plantilla.
      </p>
    );
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {cuerpo.split(PLACEHOLDER_SEPARADOR).map((parte, indice) =>
        PLACEHOLDER_EXACTO.test(parte) ? (
          <mark
            // El índice es estable: el cuerpo no se reordena ni se edita acá.
            key={indice}
            className="rounded bg-primary/15 px-1 font-mono text-[0.9em] font-medium text-primary"
          >
            {parte}
          </mark>
        ) : (
          <span key={indice}>{parte}</span>
        )
      )}
    </p>
  );
}

interface BarraSincronizacionProps {
  /** Número o nombre verificado con que quedó conectado el canal */
  nombreConexion: string | null;
  /** Estado de la fila de integrations: si no está activa, el envío puede fallar */
  estadoConexion: string;
  /** null = a esta subcuenta nunca se le pidieron las plantillas a Meta */
  ultimaSincronizacion: string | null;
  region: ConfigRegional | null;
}

export function BarraSincronizacion({
  nombreConexion,
  estadoConexion,
  ultimaSincronizacion,
  region,
}: BarraSincronizacionProps) {
  // null mientras no se haya presionado: "todavía no preguntamos" no es lo
  // mismo que "preguntamos y no hubo error".
  const [estado, setEstado] = useState<EstadoSincronizacion | null>(null);
  const [pendiente, iniciarSincronizacion] = useTransition();
  const fechaUltima = cuando(ultimaSincronizacion, region);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              WhatsApp conectado
              {nombreConexion ? `: ${nombreConexion}` : ""}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {fechaUltima
                ? `Última sincronización: ${fechaUltima}.`
                : ultimaSincronizacion
                  ? "Ya se sincronizó antes, pero no podemos mostrar la fecha."
                  : "Todavía no le pediste las plantillas a Meta."}
            </p>
          </div>

          <Button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciarSincronizacion(async () => {
                setEstado(await sincronizarConMeta());
              })
            }
          >
            <RefreshCw
              className={pendiente ? "size-4 animate-spin" : "size-4"}
            />
            {pendiente ? "Consultando a Meta…" : "Sincronizar con Meta"}
          </Button>
        </div>

        {estadoConexion !== "activa" && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
            <span>
              La conexión de WhatsApp figura como{" "}
              <span className="font-medium">{estadoConexion}</span>. Podemos
              intentar leer las plantillas igual, pero si el canal no está
              activo el envío tampoco va a funcionar. Revísalo en{" "}
              <Link
                href="/configuracion/integraciones"
                className="font-medium text-primary underline underline-offset-2"
              >
                Integraciones
              </Link>
              .
            </span>
          </p>
        )}

        {estado?.error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-destructive">
                No pudimos sincronizar
              </p>
              {/* El texto de Meta, sin traducir ni resumir: es el que dice
                  exactamente qué permiso o qué id está fallando. */}
              <p className="break-words text-sm text-muted-foreground">
                {estado.error}
              </p>
            </div>
          </div>
        )}

        {estado?.aviso && (
          <div className="flex items-start gap-2.5 rounded-lg border border-success/40 bg-success/5 p-3">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
            <p className="text-sm text-muted-foreground">{estado.aviso}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Tres situaciones, no dos.
 *
 * "No sabemos" existe porque la consulta de la integración puede fallar, y
 * ahí decir "no tienes WhatsApp conectado" sería inventar una respuesta a
 * una pregunta que quedó sin contestar.
 */
export type EstadoConexion = "conectado" | "sin-conectar" | "desconocida";

interface ListaPlantillasProps {
  plantillas: PlantillaFila[];
  region: ConfigRegional | null;
  /** null = nunca se sincronizó; con fecha = Meta ya contestó alguna vez */
  ultimaSincronizacion: string | null;
  conexion: EstadoConexion;
  /** true si la consulta llegó al tope y hay plantillas que no se ven */
  truncada: boolean;
}

export function ListaPlantillas({
  plantillas,
  region,
  ultimaSincronizacion,
  conexion,
  truncada,
}: ListaPlantillasProps) {
  const aprobadas = plantillas.filter((p) => p.status === "aprobada").length;
  const fueraDelLote = idsFueraDelUltimoLote(plantillas);

  // Primero lo que se puede enviar hoy: quien entra a esta pantalla viene a
  // buscar con qué iniciar una conversación, no a auditar el catálogo.
  const ordenadas = [...plantillas].sort((a, b) => {
    const diferencia = describirEstado(a.status).rango - describirEstado(b.status).rango;
    return diferencia !== 0 ? diferencia : a.name.localeCompare(b.name, "es");
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plantillas de esta subcuenta</CardTitle>
        <CardDescription>
          {plantillas.length === 0
            ? "Ninguna guardada todavía."
            : `${plantillas.length} ${
                plantillas.length === 1 ? "plantilla" : "plantillas"
              }, ${aprobadas} ${
                aprobadas === 1 ? "aprobada" : "aprobadas"
              } por Meta. Esto es lo que Meta respondió en la última sincronización, no lo que tenga en este momento.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {truncada && (
          <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Se muestran las primeras {plantillas.length} plantillas. Si tienes
            más, no caben en esta pantalla todavía.
          </p>
        )}

        {plantillas.length === 0 ? (
          <EstadoVacio
            conexion={conexion}
            ultimaSincronizacion={ultimaSincronizacion}
            region={region}
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {ordenadas.map((plantilla) => (
              <FilaPlantilla
                key={plantilla.id}
                plantilla={plantilla}
                region={region}
                fueraDelUltimoLote={fueraDelLote.has(plantilla.id)}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Cuatro vacíos distintos, cuatro salidas distintas.
 *
 * "No hay WhatsApp", "nunca preguntamos", "preguntamos y no hay ninguna" y
 * "no pudimos averiguarlo" se ven igual —una lista sin filas— y piden
 * acciones opuestas. Un único "Sin plantillas" dejaría a la persona
 * presionando Sincronizar contra una cuenta que no tiene nada que traer.
 */
function EstadoVacio({
  conexion,
  ultimaSincronizacion,
  region,
}: {
  conexion: EstadoConexion;
  ultimaSincronizacion: string | null;
  region: ConfigRegional | null;
}) {
  if (conexion === "desconocida") {
    return (
      <EmptyState
        icon={TriangleAlert}
        title="No hay plantillas guardadas"
        description="Tampoco pudimos leer la conexión de WhatsApp de esta subcuenta, así que no sabemos si el problema es que falta conectarla o que nunca se sincronizó. Vuelve a cargar la página."
      />
    );
  }

  if (conexion === "sin-conectar") {
    return (
      <EmptyState
        icon={MessageSquareText}
        title="Sin plantillas"
        description="Las plantillas se traen desde la cuenta de WhatsApp Business del cliente. Mientras no haya un WhatsApp conectado en esta subcuenta, no hay de dónde traerlas."
      />
    );
  }

  if (!ultimaSincronizacion) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="Todavía no sincronizaste"
        description="No le hemos preguntado a Meta qué plantillas tiene esta cuenta. Presiona «Sincronizar con Meta» arriba: traemos las que existan con su estado de aprobación real."
      />
    );
  }

  const fecha = cuando(ultimaSincronizacion, region);
  return (
    <EmptyState
      icon={Clock}
      title="Meta no tiene ninguna plantilla en esta cuenta"
      description={`${
        fecha ? `Sincronizamos el ${fecha} y Meta` : "En la última sincronización Meta"
      } respondió sin plantillas. Créalas en el panel de Meta, espera su aprobación y vuelve a sincronizar acá.`}
    />
  );
}

function FilaPlantilla({
  plantilla,
  region,
  fueraDelUltimoLote,
}: {
  plantilla: PlantillaFila;
  region: ConfigRegional | null;
  fueraDelUltimoLote: boolean;
}) {
  const estado = describirEstado(plantilla.status);
  const idioma = IDIOMAS[plantilla.language];
  const categoria = plantilla.category
    ? (CATEGORIAS[plantilla.category] ?? plantilla.category)
    : null;
  const fechaSincronizada = cuando(plantilla.synced_at, region);

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {/* Nombre e idioma son la llave con que Meta identifica la
              plantilla al enviarla: van en monoespaciado y tal cual. */}
          <p className="truncate font-mono text-sm font-medium">
            {plantilla.name}
          </p>
          <p className="text-xs text-muted-foreground">
            {idioma ? `${idioma} (${plantilla.language})` : plantilla.language}
            {categoria ? ` · ${categoria}` : ""}
          </p>
        </div>
        <Badge variant={estado.variante}>{estado.etiqueta}</Badge>
      </div>

      <p className="text-xs text-muted-foreground">{estado.consecuencia}</p>

      <div className="rounded-lg border border-border bg-muted/40 p-3">
        <CuerpoResaltado cuerpo={plantilla.body} />
      </div>

      <p className="text-xs text-muted-foreground">
        {plantilla.variables === 0
          ? "Sin variables: el texto sale siempre igual."
          : `Espera ${plantilla.variables} ${
              plantilla.variables === 1 ? "valor" : "valores"
            }: al enviarla hay que dar ${
              plantilla.variables === 1 ? "el dato que reemplaza" : "los datos que reemplazan"
            } a los huecos resaltados, en orden.`}
      </p>

      {fueraDelUltimoLote && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-2.5 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>
            No vino en la última sincronización
            {fechaSincronizada
              ? `; lo que ves es de ${fechaSincronizada}`
              : ""}
            . Puede que ya no exista en la cuenta de Meta.
          </span>
        </p>
      )}
    </li>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, Info } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { regionDe, REGION_CHILE } from "@/lib/locale";
import { buttonClasses } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { DEFINICIONES, ENTIDADES, type Entidad } from "./route-helpers";

export const metadata: Metadata = { title: "Exportar datos" };

/**
 * Configuración → Exportar datos.
 *
 * Un cliente que no puede llevarse sus datos está secuestrado, y eso se
 * nota: desconfía, pregunta por el contrato, pide respaldos por correo.
 * Que la puerta esté abierta y a la vista es lo que hace que se quede.
 *
 * La página no descarga nada por su cuenta: cada botón es un enlace a
 * /api/exportar/[entidad], que arma el archivo mientras lo envía. Por eso
 * no necesita ni una línea de JavaScript en el navegador.
 */

interface Conteo {
  /** null = la consulta falló. Cero es un número; esto es no saber. */
  filas: number | null;
}

export default async function ExportarPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: org, error: errorRegion }, conteos] = await Promise.all([
    supabase
      .from("organizations")
      .select("timezone, currency, locale")
      .eq("id", session.org.id)
      .maybeSingle<{
        timezone: string | null;
        currency: string | null;
        locale: string | null;
      }>(),
    // Solo la cuenta: `head: true` no trae ni una fila, así que contar
    // 40.000 mensajes cuesta lo mismo que contar tres. Nadie debería
    // apretar "descargar" sin saber cuánto viene.
    Promise.all(
      ENTIDADES.map((entidad) =>
        supabase
          .from(DEFINICIONES[entidad].tabla)
          .select("id", { count: "exact", head: true })
          .eq("org_id", session.org.id)
      )
    ),
  ]);

  const region = org ? regionDe(org) : null;

  const porEntidad = new Map<Entidad, Conteo>();
  ENTIDADES.forEach((entidad, indice) => {
    const resultado = conteos[indice];
    porEntidad.set(entidad, {
      // Un error de conteo NO se pinta como cero: "0 contactos" es una
      // afirmación, y afirmar que no hay nada cuando en realidad no
      // pudimos preguntar es la clase de pantalla que hace que alguien
      // borre su cuenta creyendo que no tenía datos.
      filas: resultado?.error ? null : (resultado?.count ?? null),
    });
  });

  const fallidas = ENTIDADES.filter(
    (entidad) => porEntidad.get(entidad)?.filas === null
  ).map((entidad) => DEFINICIONES[entidad].etiqueta.toLowerCase());
  if (errorRegion || !org) fallidas.push("la configuración regional");

  // El separador de miles es cosmética pura: si no sabemos la región, el
  // formato chileno no afirma nada sobre la cuenta. Distinto de las fechas
  // del archivo, que sin zona horaria sí mentirían, y por eso la ruta se
  // niega a exportar cuando esta consulta falla.
  const numero = new Intl.NumberFormat((region ?? REGION_CHILE).locale);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/configuracion"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Configuración
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Exportar datos</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Tus datos son tuyos y te los puedes llevar cuando quieras, sin
            pedírselos a nadie. Cada botón descarga un archivo CSV que se abre
            en Excel, Numbers o Google Sheets, y que otro sistema puede
            importar. Se exporta lo que hay en la subcuenta que tienes abierta
            ahora: <strong>{session.org.name}</strong>.
          </p>
        </div>
      </div>

      {fallidas.length > 0 && <QueryError partes={fallidas} />}

      <div className="grid gap-4 sm:grid-cols-2">
        {ENTIDADES.map((entidad) => {
          const definicion = DEFINICIONES[entidad];
          const filas = porEntidad.get(entidad)?.filas ?? null;
          const vacia = filas === 0;

          return (
            <Card key={entidad} className="flex flex-col">
              <CardHeader>
                <CardTitle>{definicion.etiqueta}</CardTitle>
                <CardDescription>{definicion.descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex items-center justify-between gap-4">
                <p className="text-sm">
                  {filas === null ? (
                    <span className="text-destructive">
                      No pudimos contar las filas
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {numero.format(filas)}
                      </span>{" "}
                      {filas === 1 ? "fila" : "filas"}
                    </span>
                  )}
                </p>

                {/* Sin filas no hay enlace, y no un enlace apagado con CSS:
                    uno "deshabilitado" con pointer-events-none igual se
                    alcanza con el teclado, y bajar un archivo con solo la
                    cabecera se lee como una falla del sistema. */}
                {vacia ? (
                  <span className="text-sm text-muted-foreground">
                    Nada que exportar
                  </span>
                ) : (
                  /* Un enlace normal y no un botón con JavaScript: el
                     servidor responde con Content-Disposition y el navegador
                     descarga sin salir de la página. */
                  <a
                    href={`/api/exportar/${entidad}`}
                    download
                    className={buttonClasses("secondary", "sm")}
                  >
                    <Download className="size-4" />
                    Descargar CSV
                  </a>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Info className="size-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-base">Lo que trae y lo que no</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground">
            <li>
              Es una foto del estado <strong>actual</strong>. No es un historial:
              si ayer cambiaste el nombre de un contacto, el archivo trae el de
              hoy, no los dos.
            </li>
            <li>
              <strong>No incluye archivos adjuntos</strong> —imágenes, audios ni
              documentos que hayan viajado por las conversaciones—. El CSV lleva
              texto; para los adjuntos todavía no hay descarga.
            </li>
            <li>
              Tampoco incluye lo que no es dato del negocio: usuarios,
              contraseñas, credenciales de los canales conectados ni la
              configuración de automatizaciones y agentes.
            </li>
            {region && (
              <li>
                Las fechas salen en la zona horaria de esta subcuenta (
                <span className="font-medium text-foreground">
                  {region.timezone}
                </span>
                ) y los montos en {region.currency}, sin símbolo ni separador de
                miles, para que sumen al abrirlos.
              </li>
            )}
            <li>
              Los archivos grandes se arman mientras se descargan. Si tienes
              muchas filas puede demorar; no cierres la pestaña hasta que
              termine.
            </li>
            <li>
              El conteo de arriba es de este momento. Si alguien está cargando
              datos ahora mismo, el archivo puede traer algunas filas más.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

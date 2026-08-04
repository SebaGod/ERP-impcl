"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Copy, Check, RotateCw, TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { reportarFalloDePantalla } from "@/lib/reportar-pantalla";

/**
 * Lo que ve alguien cuando una pantalla se cae.
 *
 * Hasta ahora no había ninguna: setenta y dos páginas y cero error
 * boundaries, así que cualquier excepción al renderizar terminaba en la
 * pantalla por defecto de Next —fondo blanco, "Application error", en
 * inglés— sin menú, sin vuelta atrás y sin nada que contarle a soporte.
 * Esa pantalla es exactamente la que hace pensar que un sistema es
 * frágil, aunque la falla haya sido una consulta lenta que se recupera
 * sola al reintentar.
 *
 * Tres cosas la separan de la de Next, y las tres importan:
 *
 * 1. Reintentar de verdad. `unstable_retry()` vuelve a pedir los datos al
 *    servidor. Buena parte de estas caídas son de un segundo —la base
 *    ocupada, la red— y se arreglan sin recargar ni perder el lugar.
 * 2. Un código. Es el `digest` con que Next indexa el error en el
 *    servidor; en producción el mensaje real no viaja al navegador a
 *    propósito. Poder decir "me salió el código 3f9a" es la diferencia
 *    entre diagnosticar en un minuto y pedir que lo reproduzcan.
 * 3. Queda anotado solo. La caída entra a la bitácora de la agencia sin
 *    que nadie la reporte, que es como uno se entera antes que el cliente.
 *
 * No se muestra `error.message` crudo: cuando el error nace en el
 * servidor Next ya lo reemplaza por uno genérico, y cuando nace en el
 * cliente suele ser un texto de librería que no le dice nada a quien
 * está tratando de facturar.
 */
export function PantallaRota({
  error,
  reintentar,
  zona,
  volverA,
  volverTexto,
}: {
  error: Error & { digest?: string };
  reintentar: () => void;
  /** Qué panel se rompió: define a quién le toca mirarlo */
  zona: "app" | "agencia" | "auth" | "publica";
  /**
   * A dónde sale quien no quiere reintentar. Se omite donde no hay a
   * dónde ir: en una cotización pública el visitante no tiene sesión ni
   * menú, y un botón que lo mande al login es una puerta cerrada.
   */
  volverA?: string;
  volverTexto?: string;
}) {
  const ruta = usePathname();
  const [copiado, setCopiado] = useState(false);
  const reportado = useRef<string | null>(null);

  useEffect(() => {
    // Una vez por error. El ref evita el doble disparo del modo estricto
    // en desarrollo y, sobre todo, que reintentar diez veces escriba diez
    // filas iguales en la bitácora.
    const clave = error.digest ?? error.message;
    if (reportado.current === clave) return;
    reportado.current = clave;

    // No se espera: la pantalla ya está dibujada y el reporte es para
    // nosotros, no para quien la está mirando.
    //
    // El catch no es decorativo. La acción se ejecuta en el servidor, y
    // el motivo más probable de que esta pantalla exista es justamente
    // que el servidor no esté respondiendo — o sea que la llamada falle
    // es el caso esperado, no el raro. Sin catch eso queda como promesa
    // rechazada sin atender: ruido en la consola de quien ya está
    // mirando un error, en el único componente que no se puede permitir
    // fallar.
    reportarFalloDePantalla({
      ruta,
      digest: error.digest,
      // En producción el mensaje del servidor ya viene higienizado por
      // Next; el del cliente es el original y ese sí sirve.
      mensaje: error.message,
      zona,
    }).catch(() => {
      // No hay a quién contarle que no se pudo contar.
    });
  }, [error, ruta, zona]);

  const codigo = error.digest ?? null;

  async function copiar() {
    if (!codigo) return;
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sin permiso de portapapeles (pasa en http y en algunos móviles).
      // El código está a la vista y se puede seleccionar a mano.
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert className="size-6 text-destructive" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">
            No pudimos mostrar esta pantalla
          </h1>
          <p className="text-sm text-muted-foreground">
            La falla ya quedó registrada de nuestro lado. Muchas veces es
            momentánea: reintentar vuelve a pedir los datos sin que pierdas
            dónde estabas.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => reintentar()}>
            <RotateCw className="size-4" />
            Reintentar
          </Button>
          {volverA && volverTexto && (
            <Link href={volverA} className={buttonClasses("secondary")}>
              {volverTexto}
            </Link>
          )}
        </div>

        {codigo && (
          <div className="flex w-full flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">
              Si vuelve a pasar, mándanos este código:
            </p>
            <div className="flex items-center justify-center gap-2">
              <code className="font-mono text-sm break-all">{codigo}</code>
              <button
                type="button"
                onClick={copiar}
                aria-label="Copiar código del error"
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {copiado ? (
                  <Check className="size-4 text-success" />
                ) : (
                  <Copy className="size-4" />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Link2 } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatMonto, hoyISO } from "@/lib/locale";
import { Card, CardContent } from "@/components/ui/card";
import { esCodigoDte, tipoDte, type CodigoDte } from "@/lib/dte/tipos";
import { DocumentoForm } from "./documento-form";
import { origenCotizacion, origenOrden, type OrigenDocumento } from "./origen";

export const metadata: Metadata = { title: "Registrar documento" };

function primero(valor: string | string[] | undefined): string {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return (bruto ?? "").trim();
}

export default async function NuevoDocumentoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const session = await requireAdminContext();
  const supabase = await createClient();
  const region = session.org.region;

  const codigoPedido = Number(primero(sp.tipo));
  // La boleta es lo que más se emite en un mesón: es el default.
  const tipoInicial: CodigoDte = esCodigoDte(codigoPedido) ? codigoPedido : 39;

  const cotizacion = primero(sp.cotizacion);
  const orden = primero(sp.orden);

  // Los precios se convierten según el tipo ELEGIDO, así que el origen se
  // carga sabiendo cuál es. Cambiar el tipo en pantalla no reconvierte lo
  // ya cargado —sería mover los precios bajo los pies del usuario—, y por
  // eso el aviso dice con qué base quedaron.
  let origen: OrigenDocumento | null = null;
  if (cotizacion) {
    origen = await origenCotizacion(
      supabase,
      session.org.id,
      cotizacion,
      tipoInicial
    );
  } else if (orden) {
    origen = await origenOrden(supabase, session.org.id, orden, tipoInicial);
  }

  // Un id que no existe (o que es de otra subcuenta) no puede quedar como
  // un formulario en blanco silencioso: quien llegó desde "Facturar"
  // esperaba su detalle cargado y lo notaría demasiado tarde.
  const origenPerdido = Boolean(cotizacion || orden) && !origen;

  const tipo = tipoDte(tipoInicial);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href={origen?.href ?? "/documentos"}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />{" "}
        {origen ? origen.etiqueta : "Boletas y facturas"}
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Registrar documento</h1>
        <p className="text-sm text-muted-foreground">
          Anota una boleta o factura que emitiste. Queda como borrador hasta
          que le pongas el folio.
        </p>
      </div>

      {origenPerdido && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">
            No encontramos el documento de origen
          </p>
          <p className="text-muted-foreground">
            El formulario está en blanco: no se cargó nada. Vuelve e inténtalo
            desde ahí, o escribe el detalle a mano.
          </p>
        </div>
      )}

      {origen && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-muted/40 p-4 text-sm">
          <p className="flex items-start gap-2">
            <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              Se cargó el detalle de{" "}
              <Link
                href={origen.href}
                className="font-medium text-primary hover:underline"
              >
                {origen.etiqueta}
              </Link>
              . Al guardar, el documento queda vinculado.
            </span>
          </p>
          {origen.seConvirtioAIva && (
            <p className="text-muted-foreground">
              Los precios venían netos y una {tipo.corto.toLowerCase()} los
              lleva con IVA incluido: se les agregó el IVA. El neto de origen
              era {formatMonto(origen.netoOrigen, region)}, y puede quedar con
              uno o dos pesos de diferencia por el redondeo a peso entero.
            </p>
          )}
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <DocumentoForm
            region={region}
            // El día del negocio, no el del servidor: una boleta hecha a
            // las 22:00 en Chile es de hoy, aunque en UTC ya sea mañana.
            hoy={hoyISO(region)}
            tipoInicial={tipoInicial}
            origen={origen}
          />
        </CardContent>
      </Card>
    </div>
  );
}

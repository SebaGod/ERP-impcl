import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2 } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFecha, formatMonto } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ESTADOS_DTE,
  TIPOS_DTE,
  type CodigoDte,
  type EstadoDte,
} from "@/lib/dte/tipos";
import { faltantesEmisor, faltantesReceptor } from "@/lib/dte/validacion";
import { AvisoEmisor } from "../aviso-emisor";
import { AccionesDocumento } from "./acciones";

export const metadata: Metadata = { title: "Documento" };

interface ItemDte {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  exenta: boolean;
  monto: number;
  position: number;
}

export default async function DocumentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireOrgContext();
  const supabase = await createClient();
  const region = session.org.region;

  const [{ data: doc }, { data: items }, { data: emisor }] = await Promise.all([
    supabase
      .from("dte_documents")
      .select("*")
      .eq("id", id)
      .eq("org_id", session.org.id)
      .maybeSingle(),
    supabase
      .from("dte_items")
      .select("id, descripcion, cantidad, precio_unitario, exenta, monto, position")
      .eq("dte_id", id)
      .order("position")
      .limit(500),
    supabase
      .from("organizations")
      .select("rut, razon_social, name, giro, acteco, direccion, comuna")
      .eq("id", session.org.id)
      .maybeSingle(),
  ]);

  if (!doc) notFound();

  const codigo = doc.tipo as CodigoDte;
  const tipo = TIPOS_DTE[codigo];
  const estado = ESTADOS_DTE[doc.estado as EstadoDte];
  const lineas = (items ?? []) as ItemDte[];
  const esBorrador = doc.estado === "borrador";

  // Solo mientras es borrador tiene sentido avisar qué falta: después ya
  // se emitió y el aviso llega tarde.
  const faltanEmisor =
    esBorrador && emisor
      ? faltantesEmisor({
          rut: emisor.rut,
          razon_social: emisor.razon_social,
          name: emisor.name,
          giro: emisor.giro,
          acteco: emisor.acteco,
          direccion: emisor.direccion,
          comuna: emisor.comuna,
        })
      : [];

  const faltanReceptor = esBorrador
    ? faltantesReceptor(codigo, {
        rut: doc.receptor_rut,
        razon_social: doc.receptor_razon_social,
        name: null,
        giro: doc.receptor_giro,
        direccion: doc.receptor_direccion,
        comuna: doc.receptor_comuna,
      })
    : [];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/documentos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Boletas y facturas
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">
              {tipo?.nombre ?? `Documento ${doc.tipo}`}
            </h1>
            {doc.folio && (
              <span className="text-2xl font-bold tabular-nums text-muted-foreground">
                N° {doc.folio}
              </span>
            )}
            <Badge variant={estado?.variant ?? "outline"}>
              {estado?.label ?? doc.estado}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {estado?.descripcion} · Emitido el{" "}
            {formatFecha(doc.fecha_emision, region)}
          </p>
        </div>
      </div>

      {faltanEmisor.length > 0 && <AvisoEmisor faltantes={faltanEmisor} />}

      {faltanReceptor.length > 0 && (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">
            Al cliente le faltan datos que una {tipo?.corto.toLowerCase()} exige
          </p>
          <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-4 text-muted-foreground">
            {faltanReceptor.map((f) => (
              <li key={f.campo}>{f.mensaje}</li>
            ))}
          </ul>
          {doc.contact_id && (
            <Link
              href={`/contactos/${doc.contact_id}`}
              className="mt-1.5 inline-block font-medium text-primary hover:underline"
            >
              Completar la ficha del cliente
            </Link>
          )}
        </div>
      )}

      {doc.ref_folio && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          <Link2 className="size-4 shrink-0 text-muted-foreground" />
          <span>
            Corrige la{" "}
            <strong>
              {TIPOS_DTE[doc.ref_tipo as CodigoDte]?.corto.toLowerCase() ??
                doc.ref_tipo}{" "}
              folio {doc.ref_folio}
            </strong>
            {doc.ref_razon ? ` · ${doc.ref_razon}` : ""}
          </span>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-y border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2 font-medium">Descripción</th>
                      <th className="px-4 py-2 text-right font-medium">Cant.</th>
                      <th className="px-4 py-2 text-right font-medium">
                        {tipo?.preciosConIva ? "P. unit. c/IVA" : "P. unit. neto"}
                      </th>
                      <th className="px-4 py-2 text-right font-medium">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineas.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2.5">
                          {l.descripcion}
                          {l.exenta && (
                            <Badge variant="outline" className="ml-2">
                              Exenta
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {Number(l.cantidad).toLocaleString("es-CL")}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMonto(Number(l.precio_unitario), region)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {formatMonto(Number(l.monto), region)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-1.5 border-t border-border p-4 text-sm">
                <Total label="Neto" valor={formatMonto(Number(doc.neto), region)} />
                {Number(doc.exento) > 0 && (
                  <Total label="Exento" valor={formatMonto(Number(doc.exento), region)} />
                )}
                {Number(doc.iva) > 0 && (
                  <Total
                    label={`IVA (${Math.round(Number(doc.tasa_iva) * 100)}%)`}
                    valor={formatMonto(Number(doc.iva), region)}
                  />
                )}
                <div className="mt-1 flex items-center justify-between border-t border-border pt-2 text-base font-semibold">
                  <span>Total</span>
                  <span className="tabular-nums">
                    {formatMonto(Number(doc.total), region)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {doc.observaciones && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Observaciones</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">
                {doc.observaciones}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cliente</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {doc.receptor_razon_social ? (
                <>
                  {doc.contact_id ? (
                    <Link
                      href={`/contactos/${doc.contact_id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {doc.receptor_razon_social}
                    </Link>
                  ) : (
                    <span className="font-medium">{doc.receptor_razon_social}</span>
                  )}
                  <Dato label="RUT" valor={doc.receptor_rut} />
                  <Dato label="Giro" valor={doc.receptor_giro} />
                  <Dato label="Dirección" valor={doc.receptor_direccion} />
                  <Dato label="Comuna" valor={doc.receptor_comuna} />
                  {!esBorrador && (
                    // Los datos se copiaron al registrar: si el cliente se
                    // cambia de dirección, el documento sigue diciendo lo
                    // que se declaró ese día.
                    <p className="mt-1 text-xs text-muted-foreground">
                      Son los datos con que se emitió; no cambian si el cliente
                      actualiza su ficha.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">
                  Consumidor final, sin identificar. Una boleta no exige
                  identificar al cliente.
                </p>
              )}
            </CardContent>
          </Card>

          <AccionesDocumento
            dteId={id}
            estado={doc.estado as EstadoDte}
            esNota={Boolean(tipo?.esNota)}
            tipoCorto={tipo?.corto ?? "documento"}
          />
        </div>
      </div>
    </div>
  );
}

function Total({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

function Dato({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">
        {valor || <span className="text-muted-foreground">—</span>}
      </span>
    </div>
  );
}

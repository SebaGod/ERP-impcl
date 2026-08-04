import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { hoyISO } from "@/lib/locale";
import { Card, CardContent } from "@/components/ui/card";
import { esCodigoDte, type CodigoDte } from "@/lib/dte/tipos";
import { DocumentoForm } from "./documento-form";

export const metadata: Metadata = { title: "Registrar documento" };

export default async function NuevoDocumentoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const session = await requireAdminContext();

  const codigo = Number(tipo);
  // La boleta es lo que más se emite en un mesón: es el default.
  const tipoInicial: CodigoDte = esCodigoDte(codigo) ? codigo : 39;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/documentos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Boletas y facturas
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Registrar documento</h1>
        <p className="text-sm text-muted-foreground">
          Anota una boleta o factura que emitiste. Queda como borrador hasta
          que le pongas el folio.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DocumentoForm
            region={session.org.region}
            // El día del negocio, no el del servidor: una boleta hecha a
            // las 22:00 en Chile es de hoy, aunque en UTC ya sea mañana.
            hoy={hoyISO(session.org.region)}
            tipoInicial={tipoInicial}
          />
        </CardContent>
      </Card>
    </div>
  );
}

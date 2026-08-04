import Link from "next/link";
import { FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { ESTADOS_DTE, TIPOS_DTE, type CodigoDte, type EstadoDte } from "@/lib/dte/tipos";

/**
 * Puente entre lo que se vendió y lo que se declara.
 *
 * Una cotización aprobada o una orden terminada se convierten en boleta o
 * factura con el detalle ya cargado. El valor no es ahorrar tipeo: es que
 * el documento tributario diga exactamente lo mismo que el cliente
 * aceptó, sin que alguien lo transcriba a mano un viernes a las siete.
 *
 * Cuando ya hay documentos emitidos sobre este origen, lo primero que se
 * muestra son ellos. Facturar dos veces el mismo trabajo es un problema
 * caro de deshacer —hay que emitir una nota de crédito— y la forma de
 * evitarlo es que se vea antes de apretar el botón, no después.
 */

export interface DocumentoVinculado {
  id: string;
  tipo: CodigoDte;
  folio: number | null;
  estado: EstadoDte;
}

export function EmitirDocumento({
  origen,
  id,
  tipoSugerido,
  documentos,
}: {
  origen: "cotizacion" | "orden";
  id: string;
  /** 33 factura para una cotización, 39 boleta para una orden de mesón */
  tipoSugerido: CodigoDte;
  documentos: DocumentoVinculado[];
}) {
  const nuevoHref = `/documentos/nuevo?tipo=${tipoSugerido}&${origen}=${id}`;
  // Los anulados no cuentan como "ya facturado": justamente se anularon
  // para volver a emitir.
  const vigentes = documentos.filter((d) => d.estado !== "anulado");

  return (
    <div className="flex flex-col gap-3">
      {vigentes.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">
            {vigentes.length === 1
              ? "Ya tiene un documento"
              : `Ya tiene ${vigentes.length} documentos`}
          </p>
          {vigentes.map((d) => (
            <Link
              key={d.id}
              href={`/documentos/${d.id}`}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
            >
              <span className="min-w-0 truncate">
                {TIPOS_DTE[d.tipo]?.corto ?? d.tipo}
                {d.folio ? ` N° ${d.folio}` : ""}
              </span>
              <Badge variant={ESTADOS_DTE[d.estado]?.variant ?? "outline"}>
                {ESTADOS_DTE[d.estado]?.label ?? d.estado}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      <Link
        href={nuevoHref}
        className={buttonClasses(
          vigentes.length > 0 ? "secondary" : "primary",
          "md"
        )}
      >
        {tipoSugerido === 39 ? (
          <Receipt className="size-4" />
        ) : (
          <FileText className="size-4" />
        )}
        {vigentes.length > 0
          ? "Emitir otro documento"
          : `Emitir ${TIPOS_DTE[tipoSugerido]?.corto.toLowerCase() ?? "documento"}`}
      </Link>

      <p className="text-xs text-muted-foreground">
        Se carga el detalle y el cliente. Puedes cambiar el tipo antes de
        guardar; queda como borrador hasta que le anotes el folio.
      </p>
    </div>
  );
}

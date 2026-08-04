import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import type { FaltanteDte } from "@/lib/dte/validacion";

/**
 * Lo que le falta a la empresa para que sus documentos sean válidos.
 *
 * Son datos que faltan UNA vez y afectan a todo lo que se emita después,
 * así que se avisan arriba del listado y no cuando alguien ya escribió la
 * factura entera. El SII rechaza el documento completo si falta el giro o
 * la actividad económica, y el folio se pierde igual.
 */
export function AvisoEmisor({ faltantes }: { faltantes: FaltanteDte[] }) {
  if (faltantes.length === 0) return null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/5 p-4">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
      <div className="flex min-w-0 flex-col gap-1.5">
        <p className="text-sm font-medium">
          A tu empresa le faltan datos que el SII exige en cada documento
        </p>
        <ul className="flex list-disc flex-col gap-0.5 pl-4 text-sm text-muted-foreground">
          {faltantes.map((f) => (
            <li key={f.campo}>{f.mensaje}</li>
          ))}
        </ul>
        <p className="text-sm text-muted-foreground">
          Puedes registrar documentos igual, pero cuando los emitas en el
          portal del SII te los va a rechazar y el folio se pierde.{" "}
          <Link
            href="/configuracion"
            className="font-medium text-primary hover:underline"
          >
            Completar en Configuración
          </Link>
        </p>
      </div>
    </div>
  );
}

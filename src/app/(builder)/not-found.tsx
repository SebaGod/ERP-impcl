import Link from "next/link";
import { Workflow } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * 404 del constructor de flujos.
 *
 * Lo llama el detalle de una automatización que no está. El caso real no
 * es un id inventado: es alguien que tenía el constructor abierto en una
 * pestaña, borró la automatización desde otra, y volvió a esta.
 *
 * Sale dentro del lienzo a pantalla completa, que no tiene barra lateral
 * —por eso el enlace de vuelta acá no es un adorno: es la única salida
 * que hay en esta sección.
 */
export default function NoEncontradoBuilder() {
  return (
    <div className="flex h-full items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Workflow className="size-6 text-muted-foreground" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">
            Esta automatización ya no está
          </h1>
          <p className="text-sm text-muted-foreground">
            Puede haberse eliminado desde otra pestaña, o pertenecer a otra
            empresa.
          </p>
        </div>

        <Link href="/automatizaciones" className={buttonClasses("primary")}>
          Ver automatizaciones
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * Lo que ve alguien cuando abre algo que no está.
 *
 * Las doce pantallas de detalle llaman a notFound() cuando la consulta
 * vuelve vacía, y eso pasa por dos motivos distintos que desde acá no se
 * pueden separar: o el registro no existe, o es de otra empresa y el
 * filtro por organización lo dejó fuera. El texto cubre los dos sin
 * afirmar cuál fue —decir "esto es de otra empresa" ya confirmaría que
 * existe, que es justo lo que el filtro está evitando.
 *
 * El segundo caso es el frecuente y tiene arreglo: alguien con varias
 * subcuentas cambió de empresa arriba y siguió un enlace de la anterior.
 * Por eso se menciona: es la diferencia entre un callejón sin salida y
 * una pista.
 *
 * Vive dentro del layout, así que el menú lateral sigue estando. Nadie
 * queda varado.
 */
export default function NoEncontrado() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="size-6 text-muted-foreground" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">No encontramos esto</h1>
          <p className="text-sm text-muted-foreground">
            Puede que se haya eliminado, o que el enlace sea de otra empresa.
            Si cambiaste de empresa en el menú de arriba, vuelve a buscarlo
            desde la sección que corresponde.
          </p>
        </div>

        <Link href="/inicio" className={buttonClasses("primary")}>
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}

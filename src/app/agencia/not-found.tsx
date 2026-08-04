import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * 404 del panel de agencia, dentro de su propio chasis.
 *
 * Lo llaman el detalle de subcuenta y el de agente. Acá el motivo casi
 * nunca es "no existe": es una subcuenta que se dio de baja, o el enlace
 * de una cartera que no es la tuya. Sale con el menú de agencia puesto,
 * no con el del cliente.
 */
export default function NoEncontradoAgencia() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <FileQuestion className="size-6 text-muted-foreground" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">No encontramos esto</h1>
          <p className="text-sm text-muted-foreground">
            La subcuenta puede haberse dado de baja, o el enlace puede ser de
            otra agencia.
          </p>
        </div>

        <Link href="/agencia/subcuentas" className={buttonClasses("primary")}>
          Ver subcuentas
        </Link>
      </div>
    </div>
  );
}

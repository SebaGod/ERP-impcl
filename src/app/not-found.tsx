import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

/**
 * 404 de toda la aplicación.
 *
 * Además de los notFound() que no atrapa un boundary más específico,
 * esta es la que recibe cualquier dirección que no exista: un enlace mal
 * copiado, una URL vieja, un bot probando rutas. Antes ahí salía la
 * pantalla por defecto de Next —"404 | This page could not be found"—
 * en inglés y sin una sola forma de volver.
 *
 * Manda a la raíz y no al panel a propósito: quien llegó acá puede no
 * tener sesión, y ofrecerle una pantalla que lo va a rebotar al login es
 * hacerlo pasar por dos puertas para lo mismo.
 */
export default function NoEncontradoGlobal() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-muted/40 px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-card shadow-sm">
          <Compass className="size-6 text-muted-foreground" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Esta dirección no existe</h1>
          <p className="text-sm text-muted-foreground">
            Puede que el enlace esté incompleto o que la página haya cambiado
            de lugar.
          </p>
        </div>

        <Link href="/" className={buttonClasses("primary")}>
          Volver al comienzo
        </Link>
      </div>
    </div>
  );
}

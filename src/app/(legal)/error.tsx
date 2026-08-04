"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención de las páginas legales.
 *
 * Parecen las menos importantes y no lo son: la política de privacidad y
 * la de eliminación de datos son URLs que Meta exige y revisa para
 * aprobar la app. Una de las dos caída durante una revisión es un
 * rechazo, y el rechazo llega sin explicar por qué.
 */
export default function ErrorLegal({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <PantallaRota
      error={error}
      reintentar={unstable_retry}
      zona="publica"
      volverA="/"
      volverTexto="Ir al comienzo"
    />
  );
}

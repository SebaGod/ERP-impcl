"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención del constructor de automatizaciones.
 *
 * El riesgo propio de esta zona es el trabajo a medio hacer: alguien
 * armando un flujo largo. Reintentar recarga desde lo último guardado en
 * el servidor, que es lo único que existe de verdad — por eso el texto
 * no promete recuperar lo que estaba en pantalla.
 */
export default function ErrorBuilder({
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
      zona="app"
      volverA="/automatizaciones"
      volverTexto="Ver automatizaciones"
    />
  );
}

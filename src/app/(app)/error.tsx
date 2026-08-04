"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención del panel del cliente.
 *
 * Vive dentro del layout, así que cuando una pantalla se cae el menú
 * lateral sigue ahí: la sensación es "esta sección falló", no "el
 * sistema se murió". Es la misma diferencia entre un error de módulo y
 * una pantalla azul.
 */
export default function ErrorPanel({
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
      volverA="/inicio"
      volverTexto="Ir al inicio"
    />
  );
}

"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención del panel de agencia.
 *
 * Se separa del panel del cliente a propósito: acá el que mira es quien
 * opera la cartera completa, y saber que lo que se cayó fue la consola
 * y no la subcuenta de alguien cambia qué hace después.
 */
export default function ErrorAgencia({
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
      zona="agencia"
      volverA="/agencia"
      volverTexto="Ir al panel"
    />
  );
}

"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención de raíz.
 *
 * Cubre lo que no cae en ningún grupo con boundary propio —la portada,
 * el onboarding, la invitación— y cualquier ruta que se agregue mañana
 * sin acordarse de esto. Es la que hace que "agregar una pantalla nueva"
 * no vuelva a significar "agregar una pantalla que puede quedar en
 * blanco".
 */
export default function ErrorRaiz({
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
      volverA="/"
      volverTexto="Ir al comienzo"
    />
  );
}

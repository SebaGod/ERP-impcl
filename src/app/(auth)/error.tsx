"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención del login y el registro.
 *
 * La más importante de todas aunque sea la de menos pantallas: quien ve
 * caerse el login todavía no entró, no tiene menú y no puede irse a otra
 * parte del sistema. Sin esto la única salida era la pantalla en blanco.
 */
export default function ErrorAuth({
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
      zona="auth"
      volverA="/login"
      volverTexto="Volver a entrar"
    />
  );
}

"use client";

import { PantallaRota } from "@/components/pantalla-rota";

/**
 * Red de contención de la cotización pública.
 *
 * Acá del otro lado hay un cliente de nuestro cliente mirando un precio
 * que le mandaron por WhatsApp. No tiene sesión, no tiene menú y no sabe
 * qué es este sistema: si ve una pantalla en blanco, lo que concluye es
 * que la empresa que le cotizó es poco seria.
 *
 * Por eso no lleva botón de volver —no hay a dónde— y sí lleva el
 * código: se lo puede pasar a quien le envió la cotización.
 */
export default function ErrorCotizacionPublica({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <PantallaRota error={error} reintentar={unstable_retry} zona="publica" />
  );
}

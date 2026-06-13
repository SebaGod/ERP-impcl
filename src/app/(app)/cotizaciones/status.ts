export type QuoteStatus =
  | "borrador"
  | "enviada"
  | "aprobada"
  | "rechazada"
  | "vencida";

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  vencida: "Vencida",
};

export const quoteStatusVariants: Record<
  QuoteStatus,
  "default" | "success" | "warning" | "destructive" | "outline"
> = {
  borrador: "outline",
  enviada: "warning",
  aprobada: "success",
  rechazada: "destructive",
  vencida: "destructive",
};

/** Una cotización "enviada" cuya fecha venció se muestra como vencida */
export function effectiveStatus(
  status: QuoteStatus,
  expiresAt: string | null,
  today: string
): QuoteStatus {
  if (status === "enviada" && expiresAt && expiresAt < today) {
    return "vencida";
  }
  return status;
}

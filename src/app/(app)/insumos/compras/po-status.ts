export type PoStatus = "borrador" | "enviada" | "recibida";

export const poStatusLabels: Record<PoStatus, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  recibida: "Recibida",
};

export const poStatusVariants: Record<
  PoStatus,
  "default" | "success" | "warning" | "outline"
> = {
  borrador: "outline",
  enviada: "warning",
  recibida: "success",
};

export type Lifecycle = "lead" | "oportunidad" | "cliente" | "perdido";

export const lifecycleLabels: Record<Lifecycle, string> = {
  lead: "Lead",
  oportunidad: "Oportunidad",
  cliente: "Cliente",
  perdido: "Perdido",
};

export const lifecycleVariants: Record<
  Lifecycle,
  "default" | "success" | "warning" | "destructive" | "outline"
> = {
  lead: "outline",
  oportunidad: "warning",
  cliente: "success",
  perdido: "destructive",
};

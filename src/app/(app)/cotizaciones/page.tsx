import type { Metadata } from "next";
import { FileText } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Cotizaciones" };

export default async function CotizacionesPage() {
  await requireAdminContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Cotizaciones</h1>
      <EmptyState
        icon={FileText}
        title="Aquí crearás tu primera cotización"
        description="El cotizador llega en el Hito 3: catálogo con costos, totales con IVA, link público, PDF y conversión a orden de trabajo con un clic."
      />
    </div>
  );
}

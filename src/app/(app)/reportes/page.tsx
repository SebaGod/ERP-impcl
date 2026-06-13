import type { Metadata } from "next";
import { PieChart } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Reportes" };

export default async function ReportesPage() {
  await requireAdminContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Reportes</h1>
      <EmptyState
        icon={PieChart}
        title="Los números de tu negocio"
        description="Ventas, margen promedio, mejores clientes y tasa de aprobación de cotizaciones llegan en el Hito 5, con exportación a CSV."
      />
    </div>
  );
}

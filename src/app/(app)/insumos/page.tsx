import type { Metadata } from "next";
import { Package } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Insumos" };

export default async function InsumosPage() {
  await requireAdminContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Insumos</h1>
      <EmptyState
        icon={Package}
        title="Control de stock e insumos"
        description="Inventario con alertas de stock mínimo y órdenes de compra llegan en el Hito 5. Tus insumos típicos de imprenta ya están precargados."
      />
    </div>
  );
}

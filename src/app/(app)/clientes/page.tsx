import type { Metadata } from "next";
import { Users } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage() {
  await requireAdminContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <EmptyState
        icon={Users}
        title="Aquí registrarás a tus clientes"
        description="La ficha de clientes con RUT, contacto e historial completo llega en el Hito 2, junto con el tablero de producción."
      />
    </div>
  );
}

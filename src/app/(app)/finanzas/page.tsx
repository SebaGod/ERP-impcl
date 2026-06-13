import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Finanzas" };

export default async function FinanzasPage() {
  await requireAdminContext();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Finanzas</h1>
      <EmptyState
        icon={Banknote}
        title="El panel del dueño"
        description="Breakeven del mes, margen real por trabajo y cuentas por cobrar llegan en el Hito 4. Tus categorías de ingresos y gastos ya están precargadas."
      />
    </div>
  );
}

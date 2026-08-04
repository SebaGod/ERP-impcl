import type { Metadata } from "next";
import Link from "next/link";
import { Building2, Plus, TriangleAlert } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { SubaccountRow, SubaccountStatus } from "@/lib/agency/types";
import { SubaccountsTable } from "./subaccounts-table";

export const metadata: Metadata = { title: "Subcuentas" };

/**
 * Instante contra el que se mide la antigüedad de cada cliente.
 *
 * Se fija aquí, en el servidor, y se le pasa a la tabla en vez de dejar
 * que el navegador lea su propio reloj: si el cliente calculara los días
 * por su cuenta, el HTML del servidor y el de la hidratación podrían
 * diferir en un día y React descartaría el árbol.
 */
function instanteDeLaConsulta(): number {
  return Date.now();
}

/** Cuántas subcuentas hay en cada estado, para el resumen del encabezado */
function contarPorEstado(
  rows: SubaccountRow[]
): Record<SubaccountStatus, number> {
  const conteo: Record<SubaccountStatus, number> = {
    activa: 0,
    prueba: 0,
    pausada: 0,
  };
  for (const row of rows) conteo[row.status] += 1;
  return conteo;
}

export default async function SubcuentasPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("agency_subaccounts", {
    p_agency: session.agency.id,
  });
  const rows = (data as SubaccountRow[] | null) ?? [];
  const conteo = contarPorEstado(rows);

  const referencia = instanteDeLaConsulta();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Subcuentas</h1>
          <p className="text-sm text-muted-foreground">
            {error || rows.length === 0
              ? "Cada cliente de la agencia vive en su propia subcuenta"
              : `${rows.length.toLocaleString("es-CL")} ${
                  rows.length === 1 ? "cliente" : "clientes"
                } en cartera · ${conteo.activa} ${
                  conteo.activa === 1 ? "activa" : "activas"
                }, ${conteo.prueba} en prueba, ${conteo.pausada} ${
                  conteo.pausada === 1 ? "pausada" : "pausadas"
                }`}
          </p>
        </div>
        <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
          <Plus className="size-4" /> Nueva subcuenta
        </Link>
      </div>

      {/* Una consulta caída no puede leerse como "no tienes clientes": son
          dos situaciones opuestas y la salida del usuario es distinta */}
      {error ? (
        <EmptyState
          icon={TriangleAlert}
          title="No pudimos cargar la cartera"
          description="La consulta a la base de datos falló, así que no mostramos nada antes que mostrar algo incompleto. Vuelve a cargar la página; si el problema sigue, avísanos con la hora exacta en que ocurrió."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Todavía no tienes subcuentas"
          description="Cada cliente vive en su propia subcuenta, con sus contactos, embudos, canales y conversaciones aislados del resto. Crea la primera y desde aquí administrarás toda la cartera sin salir del panel."
          action={
            <Link
              href="/agencia/nueva"
              className={buttonClasses("primary", "md")}
            >
              <Plus className="size-4" /> Crear la primera subcuenta
            </Link>
          }
        />
      ) : (
        // La región no se puede leer desde el cliente: la moneda y la zona
        // horaria de la agencia bajan como prop desde acá.
        <SubaccountsTable
          rows={rows}
          referencia={referencia}
          regionAgencia={session.agency.region}
        />
      )}
    </div>
  );
}

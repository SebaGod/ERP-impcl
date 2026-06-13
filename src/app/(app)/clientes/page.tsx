import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatRut } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const session = await requireAdminContext();
  const supabase = await createClient();

  let query = supabase
    .from("clients")
    .select("id, name, rut, contact_name, phone, email, work_orders(count)")
    .eq("org_id", session.org.id)
    .order("name");
  if (q) {
    query = query.ilike("name", `%${q}%`);
  }
  const { data: clients } = await query;

  const newClientButton = (
    <Link href="/clientes/nuevo" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Nuevo cliente
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Clientes</h1>
        {newClientButton}
      </div>

      <form className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Buscar por nombre…"
          className="pl-9"
        />
      </form>

      {(clients ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "Sin resultados" : "Aquí registrarás a tus clientes"}
          description={
            q
              ? `Ningún cliente coincide con "${q}".`
              : "Registra a tus clientes con RUT y datos de contacto para crearles órdenes de trabajo y cotizaciones."
          }
          action={q ? undefined : newClientButton}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  RUT
                </th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Contacto
                </th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Teléfono
                </th>
                <th className="px-4 py-3 text-right font-medium">OTs</th>
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map((client) => {
                const woCount =
                  (client.work_orders as { count: number }[] | null)?.[0]
                    ?.count ?? 0;
                return (
                  <tr
                    key={client.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/clientes/${client.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {client.name}
                      </Link>
                      {client.contact_name && (
                        <p className="text-xs text-muted-foreground md:hidden">
                          {client.contact_name}
                        </p>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                      {client.rut ? formatRut(client.rut) : "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {client.contact_name || "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {client.phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {woCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

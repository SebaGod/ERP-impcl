import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  lifecycleLabels,
  lifecycleVariants,
  type Lifecycle,
} from "./lifecycle";

export const metadata: Metadata = { title: "Contactos" };

export default async function ContactosPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, name, company, email, phone, lifecycle, score")
    .eq("org_id", session.org.id)
    .order("created_at", { ascending: false });

  const newButton = (
    <Link href="/contactos/nuevo" className={buttonClasses("primary", "md")}>
      <Plus className="size-4" /> Nuevo contacto
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Contactos</h1>
        {newButton}
      </div>

      {(contacts ?? []).length === 0 ? (
        <EmptyState
          icon={Users}
          title="Tu base de leads y clientes"
          description="Aquí viven todos tus contactos. Los agentes de IA y las automatizaciones los califican y los hacen avanzar en el embudo."
          action={newButton}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Contacto
                </th>
                <th className="px-4 py-3 text-right font-medium">Score</th>
                <th className="px-4 py-3 text-right font-medium">Etapa</th>
              </tr>
            </thead>
            <tbody>
              {(contacts ?? []).map((contact) => (
                <tr
                  key={contact.id}
                  className="border-b border-border last:border-0 hover:bg-muted/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/contactos/${contact.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {contact.name}
                    </Link>
                    {contact.company && (
                      <p className="text-xs text-muted-foreground">
                        {contact.company}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {contact.email || contact.phone || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {contact.score}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Badge variant={lifecycleVariants[contact.lifecycle as Lifecycle]}>
                      {lifecycleLabels[contact.lifecycle as Lifecycle] ??
                        contact.lifecycle}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

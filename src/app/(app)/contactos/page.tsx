import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Users } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  ContactsTable,
  type CampoFiltro,
  type ContactoFila,
  type EtiquetaFiltro,
} from "./contacts-table";

export const metadata: Metadata = { title: "Contactos" };

export default async function ContactosPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const [{ data: contacts }, { data: tags }, { data: fields }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select(
          "id, name, company, email, phone, source, lifecycle, score, tags, custom_fields"
        )
        .eq("org_id", session.org.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("tag_defs")
        .select("key, label, color")
        .eq("org_id", session.org.id)
        .order("label"),
      supabase
        .from("custom_field_defs")
        .select("key, label, field_type, options")
        .eq("org_id", session.org.id)
        .eq("entity", "contacto")
        .order("position"),
    ]);

  const contactos = (contacts ?? []) as ContactoFila[];
  const etiquetas = (tags ?? []) as EtiquetaFiltro[];
  const campos = (fields ?? []).map((campo): CampoFiltro => {
    const def = campo as Omit<CampoFiltro, "options"> & { options: unknown };
    return {
      key: def.key,
      label: def.label,
      field_type: def.field_type,
      options: Array.isArray(def.options) ? (def.options as string[]) : [],
    };
  });

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

      {contactos.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Tu base de leads y clientes"
          description="Aquí viven todos tus contactos. Los agentes de IA y las automatizaciones los califican y los hacen avanzar en el embudo."
          action={newButton}
        />
      ) : (
        <ContactsTable
          contactos={contactos}
          tags={etiquetas}
          campos={campos}
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ensureDefaultPipeline } from "@/lib/crm/pipeline";
import { buttonClasses } from "@/components/ui/button";
import {
  BoardFilters,
  type BoardOpp,
  type BoardEtiqueta,
} from "./board-filters";

export const metadata: Metadata = { title: "Oportunidades" };

interface OppRow {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  contact_id: string;
  owner_id: string | null;
  created_at: string;
  contacts: {
    id: string;
    name: string;
    source: string | null;
    tags: string[] | null;
  } | null;
}

interface MemberRow {
  user_id: string;
  profiles: { id: string; full_name: string | null } | null;
}

export default async function OportunidadesPage() {
  const session = await requireOrgContext();
  const supabase = await createClient();

  const pipeline = await ensureDefaultPipeline(supabase, session.org.id);

  const [{ data: opportunities }, { data: members }, { data: tagDefs }] =
    await Promise.all([
      supabase
        .from("opportunities")
        .select(
          "id, title, value, stage_id, contact_id, owner_id, created_at, contacts (id, name, source, tags)"
        )
        .eq("org_id", session.org.id)
        .eq("status", "abierta")
        .order("created_at", { ascending: false }),
      supabase
        .from("organization_members")
        .select("user_id, profiles (id, full_name)")
        .eq("org_id", session.org.id),
      supabase
        .from("tag_defs")
        .select("key, label, color")
        .eq("org_id", session.org.id),
    ]);

  const vendedores = ((members ?? []) as unknown as MemberRow[])
    .map((m) => ({
      id: m.user_id,
      name: m.profiles?.full_name ?? "Sin nombre",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  const nombrePorId = new Map(vendedores.map((v) => [v.id, v.name]));

  const opps: BoardOpp[] = ((opportunities ?? []) as unknown as OppRow[]).map(
    (o) => ({
      id: o.id,
      title: o.title,
      value: o.value,
      stage_id: o.stage_id,
      contact_id: o.contact_id,
      contact_name: o.contacts?.name ?? "—",
      contact_source: o.contacts?.source ?? null,
      contact_tags: o.contacts?.tags ?? [],
      owner_id: o.owner_id,
      owner_name: o.owner_id ? nombrePorId.get(o.owner_id) ?? null : null,
      created_at: o.created_at,
    })
  );

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Oportunidades</h1>
          <p className="text-muted-foreground">
            Tu embudo de ventas. Los agentes de IA también crean y mueven
            oportunidades aquí.
          </p>
        </div>
        <Link
          href="/oportunidades/nueva"
          className={buttonClasses("primary", "md")}
        >
          <Plus className="size-4" /> Nueva oportunidad
        </Link>
      </div>

      <BoardFilters
        oportunidades={opps}
        vendedores={vendedores}
        etapas={pipeline.stages}
        etiquetas={(tagDefs ?? []) as BoardEtiqueta[]}
      />
    </div>
  );
}

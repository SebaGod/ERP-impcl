import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import type { FieldEntity } from "@/lib/crm/custom-fields";
import { FieldsTable, type FieldDefRow } from "./fields-table";

export const metadata: Metadata = { title: "Campos personalizados" };

type Pestana = "todo" | FieldEntity;

const pestanas: { valor: Pestana; label: string }[] = [
  { valor: "todo", label: "Todo" },
  { valor: "contacto", label: "Contacto" },
  { valor: "oportunidad", label: "Oportunidad" },
];

function esPestana(valor: string): valor is Pestana {
  return pestanas.some((p) => p.valor === valor);
}

const CAMPOS =
  "id, entity, key, label, field_type, options, help, required, position, folder, created_at";

export default async function CamposPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const session = await requireAdminContext();
  const supabase = await createClient();

  const activa: Pestana = e && esPestana(e) ? e : "todo";

  const { data } = await supabase
    .from("custom_field_defs")
    .select(CAMPOS)
    .eq("org_id", session.org.id)
    .order("entity")
    .order("folder", { nullsFirst: true })
    .order("position")
    .order("id");

  const defs = (data ?? []) as unknown as FieldDefRow[];

  const conteos: Record<Pestana, number> = {
    todo: defs.length,
    contacto: defs.filter((campo) => campo.entity === "contacto").length,
    oportunidad: defs.filter((campo) => campo.entity === "oportunidad").length,
  };

  const visibles =
    activa === "todo" ? defs : defs.filter((campo) => campo.entity === activa);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/configuracion"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Configuración
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Campos personalizados</h1>
          <p className="text-sm text-muted-foreground">
            Cree y gestione campos para capturar y organizar la información de
            sus contactos y oportunidades.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {pestanas.map((pestana) => {
          const esActiva = pestana.valor === activa;
          return (
            <Link
              key={pestana.valor}
              href={
                pestana.valor === "todo"
                  ? "/configuracion/campos"
                  : `/configuracion/campos?e=${pestana.valor}`
              }
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium",
                "transition-colors duration-150",
                esActiva
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {pestana.label}
              <span
                className={cn(
                  "tabular-nums",
                  esActiva ? "text-primary/60" : "text-muted-foreground/60"
                )}
              >
                {conteos[pestana.valor]}
              </span>
            </Link>
          );
        })}
      </div>

      {defs.length === 0 && (
        <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
          <p className="text-sm font-medium">Aún no hay campos propios</p>
          <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">
            Un campo personalizado guarda lo que su negocio necesita y el CRM no
            trae de fábrica: comuna de despacho, giro, número de orden de
            compra. Aparece en cada ficha y su clave de fusión queda disponible
            para mensajes y automatizaciones.
          </p>
        </div>
      )}

      <FieldsTable campos={visibles} region={session.org.region} />
    </div>
  );
}

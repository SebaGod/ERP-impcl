import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  entityLabels,
  fieldTypeLabels,
  type FieldDef,
  type FieldEntity,
} from "@/lib/crm/custom-fields";
import { FieldManager, FieldRowActions } from "./field-manager";

export const metadata: Metadata = { title: "Campos personalizados" };

const entidades: FieldEntity[] = ["contacto", "oportunidad"];

const bajadas: Record<FieldEntity, string> = {
  contacto:
    "Datos extra de cada persona o empresa: comuna, giro, tipo de cliente, lo que tu negocio necesite.",
  oportunidad:
    "Datos extra de cada negocio en el embudo: número de orden de compra, plazo de entrega, competencia.",
};

export default async function CamposPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("custom_field_defs")
    .select("id, entity, key, label, field_type, options, help, required, position")
    .eq("org_id", session.org.id)
    .order("entity")
    .order("position")
    .order("id");

  const defs = (data ?? []) as FieldDef[];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/configuracion"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Configuración
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Campos personalizados</h1>
          <p className="text-sm text-muted-foreground">
            Los campos que definas aquí aparecen en las fichas de contactos y
            oportunidades, y quedan disponibles para filtrar y para las
            automatizaciones.
          </p>
        </div>
      </div>

      {entidades.map((entity) => {
        const campos = defs.filter((campo) => campo.entity === entity);
        return (
          <Card key={entity}>
            <CardHeader>
              <CardTitle>{entityLabels[entity]}</CardTitle>
              <CardDescription>{bajadas[entity]}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {campos.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                  Todavía no hay campos propios en {entityLabels[entity]}. Crea
                  el primero abajo y aparecerá en cada ficha.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {campos.map((campo, indice) => (
                    <div
                      key={campo.id}
                      className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{campo.label}</p>
                          <Badge variant="outline">
                            {fieldTypeLabels[campo.field_type]}
                          </Badge>
                          {campo.required && (
                            <Badge variant="warning">Obligatorio</Badge>
                          )}
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {campo.key}
                        </p>
                        {campo.help && (
                          <p className="text-xs text-muted-foreground">
                            {campo.help}
                          </p>
                        )}
                        {campo.field_type === "seleccion" && (
                          <p className="text-xs text-muted-foreground">
                            {campo.options.join(" · ")}
                          </p>
                        )}
                      </div>
                      <FieldRowActions
                        id={campo.id}
                        esPrimero={indice === 0}
                        esUltimo={indice === campos.length - 1}
                      />
                    </div>
                  ))}
                </div>
              )}

              <FieldManager entity={entity} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

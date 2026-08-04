import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Tags } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TagManager, TagRow, type TagDef } from "./tag-manager";

export const metadata: Metadata = { title: "Etiquetas" };

export default async function EtiquetasPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [tagsRes, contactsRes] = await Promise.all([
    supabase
      .from("tag_defs")
      .select("id, key, label, color")
      .eq("org_id", session.org.id)
      .order("label"),
    supabase.from("contacts").select("id, tags").eq("org_id", session.org.id),
  ]);

  // Si falla la consulta de contactos, los usos por etiqueta dan cero y
  // la pantalla invita a borrar etiquetas que sí se están usando.
  const tags = exigirLectura(tagsRes, "las etiquetas");
  const contacts = exigirLectura(contactsRes, "los contactos");

  const etiquetas = (tags ?? []) as TagDef[];

  // El conteo se hace en memoria: contacts.tags es un text[] y contar por
  // etiqueta en SQL exigiría una consulta por cada una.
  const usosPorKey = new Map<string, number>();
  for (const contact of (contacts ?? []) as { tags: string[] | null }[]) {
    for (const key of contact.tags ?? []) {
      usosPorKey.set(key, (usosPorKey.get(key) ?? 0) + 1);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href="/configuracion"
          className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Configuración
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Etiquetas</h1>
          <p className="text-sm text-muted-foreground">
            Marca contactos con etiquetas de color para segmentarlos y
            filtrarlos después. Cada etiqueta tiene una clave estable, así que
            puedes renombrarla sin perder a quienes ya la tienen.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nueva etiqueta</CardTitle>
          <CardDescription>
            Elige un nombre corto y un color que la distinga en los listados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TagManager />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Catálogo</CardTitle>
          <CardDescription>
            {etiquetas.length === 0
              ? "Todavía no hay etiquetas."
              : `${etiquetas.length} ${
                  etiquetas.length === 1
                    ? "etiqueta disponible"
                    : "etiquetas disponibles"
                }.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {etiquetas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center">
              <Tags className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Sin etiquetas todavía</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Las etiquetas te permiten segmentar tu base: agrupar por
                interés, por origen o por el trato que requiere cada cliente, y
                después filtrar el listado de contactos por ellas. Las
                automatizaciones también pueden aplicarlas solas cuando se
                cumple una condición. Crea la primera arriba.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {etiquetas.map((tag) => (
                <TagRow
                  key={tag.id}
                  tag={tag}
                  usos={usosPorKey.get(tag.key) ?? 0}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

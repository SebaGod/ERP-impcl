import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryForm, DeleteCategoryButton } from "./category-controls";

export const metadata: Metadata = { title: "Categorías" };

const kindLabels: Record<string, string> = {
  ingreso: "Ingresos",
  gasto_fijo: "Gastos fijos",
  gasto_variable: "Gastos variables",
};

const kindOrder = ["ingreso", "gasto_fijo", "gasto_variable"] as const;

export default async function CategoriasPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: categories } = await supabase
    .from("finance_categories")
    .select("id, name, kind")
    .eq("org_id", session.org.id)
    .order("name");

  const byKind = (kind: string) =>
    (categories ?? []).filter((c) => c.kind === kind);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/finanzas"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Finanzas
      </Link>

      <h1 className="text-2xl font-bold">Categorías</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva categoría</CardTitle>
          <CardDescription>
            Organiza tus ingresos y gastos. Las de tu rubro ya vienen
            precargadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryForm />
        </CardContent>
      </Card>

      {kindOrder.map((kind) => {
        const items = byKind(kind);
        if (items.length === 0) return null;
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle className="text-base">{kindLabels[kind]}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {items.map((category) => (
                <span
                  key={category.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-3 pr-1.5 text-sm"
                >
                  {category.name}
                  <DeleteCategoryButton id={category.id} />
                </span>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringForm } from "./recurring-form";
import { RecurringRowControls, GenerateMonthButton } from "./recurring-controls";

export const metadata: Metadata = { title: "Gastos recurrentes" };

export default async function RecurrentesPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase
      .from("recurring_expenses")
      .select(
        "id, description, amount, day_of_month, is_active, finance_categories (name)"
      )
      .eq("org_id", session.org.id)
      .order("description"),
    supabase
      .from("finance_categories")
      .select("id, name, kind")
      .eq("org_id", session.org.id)
      .in("kind", ["gasto_fijo", "gasto_variable"])
      .order("name"),
  ]);

  const activeTotal = (expenses ?? [])
    .filter((e) => e.is_active)
    .reduce((s, e) => s + e.amount, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link
        href="/finanzas"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Finanzas
      </Link>

      <h1 className="text-2xl font-bold">Gastos recurrentes</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Tus gastos fijos</CardTitle>
            <CardDescription>
              Total mensual activo: {formatCLP(activeTotal)}
            </CardDescription>
          </div>
          {(expenses ?? []).length > 0 && <GenerateMonthButton />}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {(expenses ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Carga tus gastos fijos (arriendo, sueldos, servicios) para que el
              punto de equilibrio sea preciso.
            </p>
          ) : (
            (expenses ?? []).map((expense) => {
              const category = expense.finance_categories as unknown as {
                name: string;
              } | null;
              return (
                <div
                  key={expense.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatCLP(expense.amount)} · día {expense.day_of_month}
                      {category && ` · ${category.name}`}
                    </p>
                  </div>
                  <RecurringRowControls
                    id={expense.id}
                    isActive={expense.is_active}
                  />
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agregar gasto recurrente</CardTitle>
          <CardDescription>
            Cada mes podrás generar estos gastos como movimientos con un clic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RecurringForm categories={categories ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}

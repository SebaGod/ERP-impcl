import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarClock,
  Receipt,
  Tags,
  Wallet,
} from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDate, todayISO } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { getReceivables } from "./receivables";
import { TransactionForm, type CategoryOption } from "./transaction-form";
import { DeleteTransactionButton } from "./delete-transaction-button";

export const metadata: Metadata = { title: "Finanzas" };

const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export default async function FinanzasPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const monthStart = `${today.slice(0, 7)}-01`;
  const nextMonthStart =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;

  const [{ data: txns }, { data: categories }, { data: recurring }, receivables] =
    await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, type, amount, txn_date, description, finance_categories (name, kind)"
        )
        .eq("org_id", session.org.id)
        .gte("txn_date", monthStart)
        .lt("txn_date", nextMonthStart)
        .order("txn_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("finance_categories")
        .select("id, name, kind")
        .eq("org_id", session.org.id)
        .order("kind")
        .order("name"),
      supabase
        .from("recurring_expenses")
        .select("amount")
        .eq("org_id", session.org.id)
        .eq("is_active", true),
      getReceivables(supabase, session.org.id),
    ]);

  const incomes = (txns ?? []).filter((t) => t.type === "ingreso");
  const expenses = (txns ?? []).filter((t) => t.type === "egreso");
  const totalIncome = incomes.reduce((s, t) => s + t.amount, 0);
  const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);
  const result = totalIncome - totalExpense;

  const fixedCosts = (recurring ?? []).reduce((s, r) => s + r.amount, 0);
  const coverage =
    fixedCosts > 0 ? Math.min(100, Math.round((totalIncome / fixedCosts) * 100)) : 100;
  const breakevenGap = fixedCosts - totalIncome;

  const totalReceivable = receivables.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Finanzas</h1>
        <p className="text-muted-foreground">
          Resumen de {monthNames[month - 1]} {year}.
        </p>
      </div>

      {/* Resumen del mes */}
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Ingresos del mes"
          value={formatCLP(totalIncome)}
          icon={ArrowUpCircle}
          tone="success"
        />
        <SummaryCard
          label="Egresos del mes"
          value={formatCLP(totalExpense)}
          icon={ArrowDownCircle}
          tone="destructive"
        />
        <SummaryCard
          label="Resultado"
          value={formatCLP(result)}
          icon={Wallet}
          tone={result >= 0 ? "success" : "destructive"}
        />
      </div>

      {/* Breakeven + por cobrar */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4.5 text-muted-foreground" />
              Punto de equilibrio del mes
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {fixedCosts === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no cargas tus costos fijos.{" "}
                <Link
                  href="/finanzas/recurrentes"
                  className="font-medium text-primary hover:underline"
                >
                  Agrégalos
                </Link>{" "}
                (arriendo, sueldos, etc.) para ver cuánto necesitas vender para
                cubrirlos.
              </p>
            ) : (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">
                    Costos fijos mensuales
                  </span>
                  <span className="font-semibold">{formatCLP(fixedCosts)}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={
                      breakevenGap <= 0 ? "h-full bg-success" : "h-full bg-warning"
                    }
                    style={{ width: `${coverage}%` }}
                  />
                </div>
                {breakevenGap <= 0 ? (
                  <p className="text-sm font-medium text-success">
                    ✓ Ya cubriste tus costos fijos del mes.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Llevas {coverage}% cubierto. Te faltan{" "}
                    <span className="font-semibold text-foreground">
                      {formatCLP(breakevenGap)}
                    </span>{" "}
                    en ingresos para alcanzar el equilibrio.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4.5 text-muted-foreground" />
              Cuentas por cobrar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-2xl font-bold">{formatCLP(totalReceivable)}</p>
            <p className="text-sm text-muted-foreground">
              {receivables.length === 0
                ? "Estás al día, sin saldos pendientes."
                : `${receivables.length} ${receivables.length === 1 ? "trabajo" : "trabajos"} con saldo pendiente.`}
            </p>
            {receivables.length > 0 && (
              <Link
                href="/finanzas/por-cobrar"
                className="text-sm font-medium text-primary hover:underline"
              >
                Ver y registrar pagos →
              </Link>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Movimientos + registrar */}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Movimientos del mes</CardTitle>
              <div className="flex gap-2">
                <Link
                  href="/finanzas/recurrentes"
                  className={buttonClasses("ghost", "sm")}
                >
                  <CalendarClock className="size-4" /> Recurrentes
                </Link>
                <Link
                  href="/finanzas/categorias"
                  className={buttonClasses("ghost", "sm")}
                >
                  <Tags className="size-4" /> Categorías
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(txns ?? []).length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Sin movimientos este mes. Registra el primero a la derecha.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 font-medium">Fecha</th>
                        <th className="py-2 font-medium">Detalle</th>
                        <th className="py-2 text-right font-medium">Monto</th>
                        <th className="py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(txns ?? []).map((txn) => {
                        const category = txn.finance_categories as unknown as {
                          name: string;
                        } | null;
                        const isIncome = txn.type === "ingreso";
                        return (
                          <tr key={txn.id} className="border-b border-border">
                            <td className="py-2.5 pr-2 text-muted-foreground">
                              {formatDate(txn.txn_date)}
                            </td>
                            <td className="py-2.5 pr-2">
                              <span>{txn.description || category?.name || "—"}</span>
                              {category && (
                                <Badge variant="outline" className="ml-2">
                                  {category.name}
                                </Badge>
                              )}
                            </td>
                            <td
                              className={
                                isIncome
                                  ? "py-2.5 text-right font-medium tabular-nums text-success"
                                  : "py-2.5 text-right font-medium tabular-nums text-destructive"
                              }
                            >
                              {isIncome ? "+" : "−"}
                              {formatCLP(txn.amount)}
                            </td>
                            <td className="py-2.5 pl-2 text-right">
                              <DeleteTransactionButton txnId={txn.id} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Registrar movimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <TransactionForm
              categories={(categories ?? []) as CategoryOption[]}
              today={today}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Wallet;
  tone: "success" | "destructive";
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={
            tone === "success"
              ? "flex size-10 items-center justify-center rounded-full bg-success/10 text-success"
              : "flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          }
        >
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

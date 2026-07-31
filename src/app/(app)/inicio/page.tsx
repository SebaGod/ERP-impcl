import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, todayISO } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getReceivables } from "@/app/(app)/finanzas/receivables";

export const metadata: Metadata = { title: "Inicio" };

export default async function InicioPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const today = todayISO();
  const monthStart = `${today.slice(0, 7)}-01`;

  const [
    { count: memberCount },
    { count: clientCount },
    { count: openWoCount },
    { count: totalWoCount },
    { data: monthIncome },
    { data: recurring },
    receivables,
  ] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", session.org.id),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("org_id", session.org.id),
    supabase
      .from("work_orders")
      .select("*", { count: "exact", head: true })
      .eq("org_id", session.org.id)
      .is("completed_at", null),
    supabase
      .from("work_orders")
      .select("*", { count: "exact", head: true })
      .eq("org_id", session.org.id),
    supabase
      .from("transactions")
      .select("amount")
      .eq("org_id", session.org.id)
      .eq("type", "ingreso")
      .gte("txn_date", monthStart),
    supabase
      .from("recurring_expenses")
      .select("amount")
      .eq("org_id", session.org.id)
      .eq("is_active", true),
    getReceivables(supabase, session.org.id),
  ]);

  const incomeThisMonth = (monthIncome ?? []).reduce((s, t) => s + t.amount, 0);
  const fixedCosts = (recurring ?? []).reduce((s, r) => s + r.amount, 0);
  const breakevenGap = fixedCosts - incomeThisMonth;
  const totalReceivable = receivables.reduce((s, r) => s + r.outstanding, 0);

  const steps = [
    {
      label: "Crear tu organización",
      done: true,
      href: null,
    },
    {
      label: "Invitar a tu equipo",
      done: (memberCount ?? 0) > 1,
      href: "/configuracion",
    },
    {
      label: "Registrar tu primer cliente",
      done: (clientCount ?? 0) > 0,
      href: "/contactos",
    },
    {
      label: "Crear tu primera orden de trabajo",
      done: (totalWoCount ?? 0) > 0,
      href: "/tablero/nueva",
    },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">
          Hola{session.fullName ? `, ${session.fullName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="text-muted-foreground">
          Bienvenido a {session.org.name}. Aquí verás el pulso de tu negocio:
          breakeven del mes, trabajos en curso y cobranza.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Primeros pasos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center gap-3">
              {step.done ? (
                <CheckCircle2 className="size-5 shrink-0 text-success" />
              ) : (
                <Circle className="size-5 shrink-0 text-muted-foreground" />
              )}
              <span
                className={
                  step.done ? "text-sm text-muted-foreground line-through" : "text-sm"
                }
              >
                {step.label}
              </span>
              {!step.done && step.href && (
                <Link
                  href={step.href}
                  className="ml-auto flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Ir <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Punto de equilibrio
            </CardTitle>
          </CardHeader>
          <CardContent>
            {fixedCosts === 0 ? (
              <>
                <p className="text-2xl font-bold text-muted-foreground/40">—</p>
                <Link
                  href="/finanzas/recurrentes"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Cargar costos fijos
                </Link>
              </>
            ) : breakevenGap <= 0 ? (
              <>
                <p className="text-2xl font-bold text-success">Cubierto</p>
                <p className="text-xs text-muted-foreground">
                  Ya cubriste tus costos fijos del mes
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold">{formatCLP(breakevenGap)}</p>
                <p className="text-xs text-muted-foreground">
                  te faltan para el equilibrio
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              OTs en curso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{openWoCount ?? 0}</p>
            <Link
              href="/tablero"
              className="text-xs font-medium text-primary hover:underline"
            >
              Ver tablero
            </Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Por cobrar
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatCLP(totalReceivable)}</p>
            {totalReceivable > 0 ? (
              <Link
                href="/finanzas/por-cobrar"
                className="text-xs font-medium text-primary hover:underline"
              >
                Ver cuentas por cobrar
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">Estás al día</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

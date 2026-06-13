import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Inicio" };

export default async function InicioPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const [{ count: memberCount }, { count: clientCount }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", session.org.id),
    supabase
      .from("clients")
      .select("*", { count: "exact", head: true })
      .eq("org_id", session.org.id),
  ]);

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
      href: "/clientes",
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
        {[
          { title: "Breakeven del mes", note: "Disponible en el Hito 4" },
          { title: "OTs en curso", note: "Disponible en el Hito 2" },
          { title: "Por cobrar", note: "Disponible en el Hito 4" },
        ].map((item) => (
          <Card key={item.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {item.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-muted-foreground/40">—</p>
              <p className="text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

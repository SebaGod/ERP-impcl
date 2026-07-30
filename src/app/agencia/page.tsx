import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Contact, Plus, Target } from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateAgencyForm, EnterOrgButton } from "./agency-forms";

export const metadata: Metadata = { title: "Panel de agencia" };

interface Subaccount {
  id: string;
  name: string;
  rut: string | null;
  created_at: string;
}

export default async function AgenciaPage() {
  const session = await getSessionContext();
  if (!session) redirect("/login");

  // Sin agencia todavía: ofrecer crearla
  if (!session.agency) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">Crea tu agencia</h1>
          <p className="text-sm text-muted-foreground">
            Administra a todos tus clientes desde un solo lugar: cada uno vive
            en su propia subcuenta y tú navegas entre ellas.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <CreateAgencyForm />
          </CardContent>
        </Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: subaccounts } = await supabase
    .from("organizations")
    .select("id, name, rut, created_at")
    .eq("agency_id", session.agency.id)
    .order("name");

  const rows = (subaccounts ?? []) as Subaccount[];

  // Métricas por subcuenta (solo conteos; la RLS ya acota a la agencia)
  const stats = await Promise.all(
    rows.map(async (org) => {
      const [contacts, opportunities] = await Promise.all([
        supabase
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org.id),
        supabase
          .from("opportunities")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org.id)
          .eq("status", "abierta"),
      ]);
      return {
        orgId: org.id,
        contacts: contacts.count ?? 0,
        opportunities: opportunities.count ?? 0,
      };
    })
  );
  const statsById = new Map(stats.map((s) => [s.orgId, s]));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{session.agency.name}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Aún no tienes subcuentas"
              : `${rows.length} ${rows.length === 1 ? "subcuenta" : "subcuentas"}`}
          </p>
        </div>
        <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
          <Plus className="size-4" /> Nueva subcuenta
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <Building2 className="size-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Crea la primera subcuenta</p>
              <p className="text-sm text-muted-foreground">
                Cada cliente tiene su propio espacio, aislado del resto.
              </p>
            </div>
            <Link
              href="/agencia/nueva"
              className={buttonClasses("primary", "md")}
            >
              <Plus className="size-4" /> Nueva subcuenta
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((org) => {
            const stat = statsById.get(org.id);
            return (
              <Card key={org.id} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">
                      {org.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 truncate">{org.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col justify-between gap-4">
                  <div className="flex gap-5 text-sm">
                    <span
                      className="flex items-center gap-1.5 text-muted-foreground"
                      title="Contactos"
                    >
                      <Contact className="size-4" />
                      {stat?.contacts ?? 0}
                    </span>
                    <span
                      className="flex items-center gap-1.5 text-muted-foreground"
                      title="Oportunidades abiertas"
                    >
                      <Target className="size-4" />
                      {stat?.opportunities ?? 0}
                    </span>
                  </div>
                  <div>
                    <EnterOrgButton orgId={org.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Building2,
  Contact,
  Layers,
  MessagesSquare,
  Plus,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCLP } from "@/lib/format";
import type { AgencyOverview, SubaccountRow } from "@/lib/agency/types";
import { CreateAgencyForm } from "./agency-forms";
import { SubaccountsTable } from "./subaccounts-table";

export const metadata: Metadata = { title: "Panel de agencia" };

const emptyOverview: AgencyOverview = {
  subaccounts: 0,
  active: 0,
  trial: 0,
  paused: 0,
  mrr: 0,
  contacts: 0,
  open_opportunities: 0,
  pipeline_value: 0,
  open_conversations: 0,
  snapshots: 0,
};

function formatCount(value: number): string {
  return value.toLocaleString("es-CL");
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        <span className="truncate">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </Card>
  );
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

  const agency = session.agency;
  const supabase = await createClient();

  const [overviewResult, subaccountsResult] = await Promise.all([
    supabase.rpc("agency_overview", { p_agency: agency.id }),
    supabase.rpc("agency_subaccounts", { p_agency: agency.id }),
  ]);

  const overview =
    (overviewResult.data as AgencyOverview | null) ?? emptyOverview;
  const rows = (subaccountsResult.data as SubaccountRow[] | null) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{agency.name}</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "Aún no tienes subcuentas"
              : `Cartera de ${formatCount(rows.length)} ${
                  rows.length === 1 ? "cliente" : "clientes"
                }`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/agencia/plantillas"
            className={buttonClasses("secondary", "md")}
          >
            <Layers className="size-4" /> Plantillas
          </Link>
          <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
            <Plus className="size-4" /> Nueva subcuenta
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="mx-auto flex max-w-md flex-col items-center gap-3 py-14 text-center">
            <Building2 className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Crea la primera subcuenta</p>
              <p className="text-sm text-muted-foreground">
                Cada cliente vive en su propia subcuenta, con sus contactos,
                embudos y conversaciones aislados del resto. Tú entras y sales
                de ellas desde este panel.
              </p>
            </div>
            <Link
              href="/agencia/nueva"
              className={buttonClasses("primary", "md")}
            >
              <Plus className="size-4" /> Crear la primera subcuenta
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            <Kpi
              icon={Wallet}
              label="MRR"
              value={formatCLP(overview.mrr)}
              hint="Ingreso mensual recurrente"
            />
            <Kpi
              icon={Building2}
              label="Subcuentas"
              value={formatCount(overview.subaccounts)}
              hint={`${formatCount(overview.active)} activas / ${formatCount(
                overview.trial
              )} prueba / ${formatCount(overview.paused)} pausadas`}
            />
            <Kpi
              icon={Contact}
              label="Contactos"
              value={formatCount(overview.contacts)}
              hint="En todas las subcuentas"
            />
            <Kpi
              icon={Target}
              label="Oportunidades abiertas"
              value={formatCount(overview.open_opportunities)}
              hint="Negocios en curso"
            />
            <Kpi
              icon={TrendingUp}
              label="Valor del pipeline"
              value={formatCLP(overview.pipeline_value)}
              hint="Suma de oportunidades abiertas"
            />
            <Kpi
              icon={MessagesSquare}
              label="Conversaciones abiertas"
              value={formatCount(overview.open_conversations)}
              hint="Pendientes de respuesta"
            />
          </div>

          <SubaccountsTable rows={rows} />
        </>
      )}
    </div>
  );
}

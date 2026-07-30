import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ClipboardList,
  Contact,
  FileText,
  MessageSquare,
  Target,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatRut } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  statusLabels,
  statusVariants,
  type SubaccountStatus,
} from "@/lib/agency/types";
import { EnterOrgButton } from "../../agency-forms";
import { ApplyTemplateForm, SubaccountForm } from "./subaccount-form";

export const metadata: Metadata = { title: "Subcuenta" };

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  rut: string | null;
  status: SubaccountStatus;
  plan: string | null;
  monthly_fee: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

interface SnapshotOption {
  id: string;
  name: string;
  description: string | null;
}

export default async function SubcuentaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { data: orgData } = await supabase
    .from("organizations")
    .select(
      "id, name, slug, rut, status, plan, monthly_fee, contact_name, contact_email, contact_phone, notes, created_at"
    )
    .eq("id", id)
    .eq("agency_id", session.agency.id)
    .maybeSingle();

  if (!orgData) notFound();
  const org = orgData as OrgRow;

  const [contacts, opportunities, conversations, workOrders, quotes, templates] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id", { count: "exact", head: true })
        .eq("org_id", id),
      supabase
        .from("opportunities")
        .select("id", { count: "exact", head: true })
        .eq("org_id", id)
        .eq("status", "abierta"),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", id)
        .eq("status", "abierta"),
      supabase
        .from("work_orders")
        .select("id", { count: "exact", head: true })
        .eq("org_id", id),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("org_id", id),
      supabase
        .from("agency_snapshots")
        .select("id, name, description")
        .eq("agency_id", session.agency.id)
        .order("created_at", { ascending: false }),
    ]);

  const snapshots = (templates.data ?? []) as SnapshotOption[];

  const metrics = [
    { label: "Contactos", value: contacts.count ?? 0, icon: Contact },
    {
      label: "Oportunidades abiertas",
      value: opportunities.count ?? 0,
      icon: Target,
    },
    {
      label: "Conversaciones abiertas",
      value: conversations.count ?? 0,
      icon: MessageSquare,
    },
    {
      label: "Órdenes de trabajo",
      value: workOrders.count ?? 0,
      icon: ClipboardList,
    },
    { label: "Cotizaciones", value: quotes.count ?? 0, icon: FileText },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link
        href="/agencia"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Panel de agencia
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">{org.name}</h1>
            <Badge variant={statusVariants[org.status] ?? "outline"}>
              {statusLabels[org.status] ?? org.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {org.rut ? `RUT ${formatRut(org.rut)} · ` : ""}
            Cliente desde el {formatDate(org.created_at)}
          </p>
        </div>
        <EnterOrgButton orgId={id} label="Entrar a la cuenta" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <metric.icon className="size-3.5 shrink-0" />
                <span className="truncate">{metric.label}</span>
              </span>
              <span className="text-2xl font-semibold tabular-nums">
                {metric.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ficha comercial</CardTitle>
          <p className="text-sm text-muted-foreground">
            Datos que usa tu agencia para administrar la cuenta. El cliente no
            los ve.
          </p>
        </CardHeader>
        <CardContent>
          <SubaccountForm
            org={{
              id: org.id,
              status: org.status,
              plan: org.plan,
              monthly_fee: org.monthly_fee,
              contact_name: org.contact_name,
              contact_email: org.contact_email,
              contact_phone: org.contact_phone,
              notes: org.notes,
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aplicar plantilla</CardTitle>
          <p className="text-sm text-muted-foreground">
            Copia la configuración de una plantilla sobre esta cuenta: embudos,
            etapas, catálogo, insumos, proveedores, categorías y agentes.
          </p>
        </CardHeader>
        <CardContent>
          {snapshots.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                Todavía no tienes plantillas. Captura la configuración de una
                subcuenta que ya dejaste lista y reutilízala en las próximas.
              </p>
              <Link
                href="/agencia/plantillas/nueva"
                className={buttonClasses("secondary", "sm")}
              >
                Crear una plantilla
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Es aditivo: solo agrega lo que falta. No borra ni sobrescribe lo
                que la cuenta ya tiene, y no duplica lo que coincide.
              </p>
              <ApplyTemplateForm orgId={id} templates={snapshots} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

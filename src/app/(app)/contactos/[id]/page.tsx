import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, MessageSquare } from "lucide-react";
import { requireOrgContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatFechaHora } from "@/lib/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ContactForm } from "../contact-form";
import { updateContact } from "../actions";
import { DeleteContactButton } from "./delete-contact-button";
import { lifecycleLabels, lifecycleVariants, type Lifecycle } from "../lifecycle";

export const metadata: Metadata = { title: "Contacto" };

export default async function ContactoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireOrgContext();
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select(
      "id, name, email, phone, company, source, lifecycle, score, notes"
    )
    .eq("id", id)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!contact) notFound();

  const [{ data: conversations }, { data: appointments }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, channel, status, last_message_at")
      .eq("contact_id", id)
      .eq("org_id", session.org.id)
      .order("last_message_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, title, starts_at, status")
      .eq("contact_id", id)
      .eq("org_id", session.org.id)
      .order("starts_at"),
  ]);

  const lifecycle = contact.lifecycle as Lifecycle;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link
        href="/contactos"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Contactos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{contact.name}</h1>
          <Badge variant={lifecycleVariants[lifecycle]}>
            {lifecycleLabels[lifecycle] ?? contact.lifecycle}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Calificación{" "}
          <span className="font-semibold text-foreground">
            {contact.score}/100
          </span>
        </p>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Datos del contacto</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactForm
                action={updateContact.bind(null, contact.id)}
                defaults={{
                  name: contact.name,
                  email: contact.email ?? "",
                  phone: contact.phone ?? "",
                  company: contact.company ?? "",
                  source: contact.source ?? "",
                  lifecycle: contact.lifecycle,
                  notes: contact.notes ?? "",
                }}
                submitLabel="Guardar cambios"
              />
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="size-4.5 text-muted-foreground" />
                Conversaciones
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {(conversations ?? []).length === 0 ? (
                <p className="text-muted-foreground">Sin conversaciones.</p>
              ) : (
                (conversations ?? []).map((conv) => (
                  <div
                    key={conv.id}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
                  >
                    <span className="capitalize">{conv.channel}</span>
                    <Badge variant="outline">{conv.status}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarCheck className="size-4.5 text-muted-foreground" />
                Citas
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              {(appointments ?? []).length === 0 ? (
                <p className="text-muted-foreground">Sin citas.</p>
              ) : (
                (appointments ?? []).map((appt) => (
                  <div
                    key={appt.id}
                    className="rounded-lg border border-border px-3 py-2"
                  >
                    <p className="font-medium">{appt.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFechaHora(appt.starts_at, session.org.region)}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <DeleteContactButton contactId={contact.id} />
        </div>
      </div>
    </div>
  );
}

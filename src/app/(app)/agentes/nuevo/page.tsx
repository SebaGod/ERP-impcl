import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AgentForm } from "../agent-form";
import { createAgent } from "../actions";

export const metadata: Metadata = { title: "Nuevo agente" };

export default async function NuevoAgentePage() {
  await requireAdminContext();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/agentes"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Agentes
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Nuevo agente</CardTitle>
          <CardDescription>
            Dejé valores de ejemplo para un asistente de ventas; ajústalos a tu
            negocio. Lo podrás probar en un chat antes de conectarlo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentForm action={createAgent} submitLabel="Crear agente" />
        </CardContent>
      </Card>
    </div>
  );
}

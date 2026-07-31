import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Bot, Activity } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { costoUsd, formatTokens, formatUsd, nombreModelo } from "@/lib/agent/pricing";
import { AgentConsoleForm, type AgenteConsola } from "../agent-console-form";

export const metadata: Metadata = { title: "Agente · Consola" };

interface AgenteDetalle extends AgenteConsola {
  org_id: string;
  created_at: string;
}

interface EntradaConocimiento {
  id: string;
  title: string;
  content: string | null;
  position: number | null;
}

interface CorridaDetalle {
  id: string;
  summary: string | null;
  tools_used: string[] | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

/** Cuánto del contenido se muestra en la vista de solo lectura */
const RESUMEN_LARGO = 140;

export default async function ConsolaAgenteDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ org?: string }>;
}) {
  const { id } = await params;
  const { org: orgParam } = await searchParams;

  const session = await requireAgencyContext();
  const supabase = await createClient();

  const { data: orgsData } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("agency_id", session.agency.id)
    .order("name");

  const subcuentas = (orgsData ?? []) as { id: string; name: string }[];
  const subcuenta = subcuentas.find((o) => o.id === orgParam);
  // Un id de agente no dice a qué cliente pertenece: el org llega por query
  // y solo vale si es una subcuenta de esta agencia.
  if (!subcuenta) notFound();

  const [{ data: agenteData }, { data: conocimientoData }, { data: corridasData }] =
    await Promise.all([
      supabase
        .from("ai_agents")
        .select(
          "id, org_id, name, goal, personality, additional_info, model, is_active, auto_reply, created_at"
        )
        .eq("id", id)
        .eq("org_id", subcuenta.id)
        .maybeSingle(),
      supabase
        .from("ai_agent_knowledge")
        .select("id, title, content, position")
        .eq("ai_agent_id", id)
        .eq("org_id", subcuenta.id)
        .order("position"),
      supabase
        .from("ai_agent_runs")
        .select("id, summary, tools_used, input_tokens, output_tokens, created_at")
        .eq("ai_agent_id", id)
        .eq("org_id", subcuenta.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const agente = agenteData as AgenteDetalle | null;
  if (!agente) notFound();

  const conocimiento = (conocimientoData ?? []) as EntradaConocimiento[];
  const corridas = (corridasData ?? []) as CorridaDetalle[];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/agencia/consola/agentes"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Volver a agentes
        </Link>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">{agente.name}</h1>
              <Badge variant={agente.is_active ? "success" : "outline"}>
                {agente.is_active ? "Activo" : "Pausado"}
              </Badge>
              {agente.auto_reply && <Badge>Respuesta automática</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {subcuenta.name} · {nombreModelo(agente.model)} · creado el{" "}
              {formatDateTime(agente.created_at)}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuración</CardTitle>
          <CardDescription>
            Los cambios se aplican en la cuenta del cliente de inmediato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AgentConsoleForm
            agente={{
              id: agente.id,
              name: agente.name,
              goal: agente.goal,
              personality: agente.personality,
              additional_info: agente.additional_info,
              model: agente.model,
              is_active: agente.is_active,
              auto_reply: agente.auto_reply,
            }}
            orgId={subcuenta.id}
          />
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="size-4" /> Base de conocimiento
            </CardTitle>
            <CardDescription>
              Solo lectura: las entradas se editan dentro de la subcuenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {conocimiento.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin entradas. El agente responde solo con sus instrucciones; una
                base de conocimiento le da precios, políticas y respuestas
                frecuentes para no improvisar.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {conocimiento.map((k) => {
                  const texto = (k.content ?? "").trim();
                  return (
                    <li key={k.id} className="flex flex-col gap-0.5 py-2.5">
                      <p className="text-sm font-medium">{k.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {texto.length === 0
                          ? "Sin contenido"
                          : texto.length > RESUMEN_LARGO
                            ? `${texto.slice(0, RESUMEN_LARGO)}…`
                            : texto}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Corridas recientes
            </CardTitle>
            <CardDescription>Últimas 20 respuestas del agente.</CardDescription>
          </CardHeader>
          <CardContent>
            {corridas.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay corridas. Aparecerán cuando el agente conteste su
                primera conversación.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {corridas.map((r) => {
                  const entrada = Number(r.input_tokens ?? 0);
                  const salida = Number(r.output_tokens ?? 0);
                  const herramientas = r.tools_used ?? [];
                  return (
                    <li key={r.id} className="flex flex-col gap-1 py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(r.created_at)}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                          {formatTokens(entrada + salida)} tok ·{" "}
                          {formatUsd(costoUsd(agente.model, entrada, salida))}
                        </span>
                      </div>
                      <p className="text-sm">{r.summary ?? "Sin resumen"}</p>
                      {herramientas.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {herramientas.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

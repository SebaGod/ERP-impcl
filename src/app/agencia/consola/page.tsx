import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Plug,
  Radio,
} from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { statusLabels, statusVariants, type IntegrationStatus } from "@/lib/channels/providers";

export const metadata: Metadata = { title: "Consola" };

interface IntegracionAgencia {
  org_id: string;
  org_name: string;
  provider: string;
  display_name: string | null;
  status: IntegrationStatus;
  last_event_at: string | null;
  last_error: string | null;
  events_24h: number;
}

interface EventoWebhook {
  id: string;
  provider: string;
  event_id: string | null;
  org_id: string | null;
  status: string;
  error: string | null;
  created_at: string;
}

interface CorridaAgente {
  id: string;
  org_id: string;
  summary: string | null;
  tools_used: string[] | null;
  created_at: string;
  input_tokens: number | null;
  output_tokens: number | null;
}

const estadoWebhook: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  procesado: "success",
  recibido: "warning",
  ignorado: "outline",
  error: "destructive",
};

export default async function ConsolaPage() {
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const [{ data: integraciones }, { data: eventos }, { data: corridas }, { data: orgs }] =
    await Promise.all([
      supabase.rpc("agency_integrations", { p_agency: session.agency.id }),
      supabase
        .from("webhook_events")
        .select("id, provider, event_id, org_id, status, error, created_at")
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("ai_agent_runs")
        .select("id, org_id, summary, tools_used, created_at, input_tokens, output_tokens")
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("organizations")
        .select("id, name")
        .eq("agency_id", session.agency.id),
    ]);

  const filas = (integraciones ?? []) as IntegracionAgencia[];
  const webhooks = (eventos ?? []) as EventoWebhook[];
  const runs = (corridas ?? []) as CorridaAgente[];
  const nombrePorOrg = new Map(
    ((orgs ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name])
  );

  const conError = filas.filter((f) => f.status === "error").length;
  const activas = filas.filter((f) => f.status === "activa").length;
  const eventos24h = filas.reduce((sum, f) => sum + Number(f.events_24h ?? 0), 0);
  const webhooksConError = webhooks.filter((w) => w.status === "error").length;
  const tokens = runs.reduce(
    (sum, r) => sum + Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0),
    0
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Consola</h1>
        <p className="text-sm text-muted-foreground">
          Estado del sistema en todas tus subcuentas: canales conectados,
          mensajes entrantes y corridas del agente.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Plug}
          label="Canales activos"
          value={String(activas)}
          hint={`${filas.length} conectados en total`}
        />
        <Kpi
          icon={Radio}
          label="Mensajes 24 h"
          value={String(eventos24h)}
          hint="Webhooks entrantes"
        />
        <Kpi
          icon={Bot}
          label="Corridas del agente"
          value={String(runs.length)}
          hint={`${tokens.toLocaleString("es-CL")} tokens`}
        />
        <Kpi
          icon={conError + webhooksConError > 0 ? AlertTriangle : CheckCircle2}
          label="Con error"
          value={String(conError + webhooksConError)}
          hint={
            conError + webhooksConError === 0
              ? "Todo en orden"
              : "Requiere revisión"
          }
          alerta={conError + webhooksConError > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Canales por subcuenta</CardTitle>
        </CardHeader>
        <CardContent>
          {filas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ninguna subcuenta tiene canales conectados todavía. Se conectan
              desde Configuración → Integraciones dentro de cada cuenta.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 font-medium">Subcuenta</th>
                    <th className="py-2 font-medium">Canal</th>
                    <th className="py-2 font-medium">Estado</th>
                    <th className="py-2 text-right font-medium">24 h</th>
                    <th className="py-2 font-medium">Último evento</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={`${f.org_id}-${f.provider}`} className="border-b border-border">
                      <td className="py-2.5">
                        <Link
                          href={`/agencia/subcuentas/${f.org_id}`}
                          className="hover:underline"
                        >
                          {f.org_name}
                        </Link>
                      </td>
                      <td className="py-2.5 capitalize">{f.provider}</td>
                      <td className="py-2.5">
                        <Badge variant={statusVariants[f.status]}>
                          {statusLabels[f.status]}
                        </Badge>
                        {f.last_error && (
                          <span className="ml-2 text-xs text-destructive">
                            {f.last_error}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {f.events_24h}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {f.last_event_at ? formatDateTime(f.last_event_at) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Radio className="size-4" /> Webhooks recientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {webhooks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin webhooks recibidos. Aparecerán aquí en cuanto se conecte un
                canal y llegue el primer mensaje.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {webhooks.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 py-2 text-sm">
                    <Badge variant={estadoWebhook[w.status] ?? "outline"}>
                      {w.status}
                    </Badge>
                    <span className="capitalize">{w.provider}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                      {w.org_id ? nombrePorOrg.get(w.org_id) ?? "—" : "sin subcuenta"}
                      {w.error ? ` · ${w.error}` : ""}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(w.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="size-4" /> Corridas del agente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay corridas registradas.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {runs.slice(0, 20).map((r) => (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <Badge variant={(r.tools_used ?? []).length > 0 ? "success" : "outline"}>
                      {(r.tools_used ?? []).length > 0
                        ? `${r.tools_used!.length} ${r.tools_used!.length === 1 ? "acción" : "acciones"}`
                        : "respuesta"}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate">
                      {nombrePorOrg.get(r.org_id) ?? "—"}
                      {r.summary ? ` · ${r.summary}` : ""}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                      {(Number(r.input_tokens ?? 0) + Number(r.output_tokens ?? 0)).toLocaleString("es-CL")} tok
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(r.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  alerta,
}: {
  icon: typeof Plug;
  label: string;
  value: string;
  hint: string;
  alerta?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={cn("size-4", alerta && "text-destructive")} />
          <span className="text-xs">{label}</span>
        </div>
        <p className={cn("text-2xl font-bold", alerta && "text-destructive")}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

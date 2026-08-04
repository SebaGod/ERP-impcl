import type { Metadata } from "next";
import Link from "next/link";
import { Bot, Building2, Sparkles, Zap } from "lucide-react";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import {
  consumoPor,
  formatUsd,
  nombreModelo,
  type ResumenConsumo,
} from "@/lib/agent/pricing";

export const metadata: Metadata = { title: "Agentes · Consola" };

interface SubcuentaFila {
  id: string;
  name: string;
  status: string | null;
}

interface AgenteFila {
  id: string;
  org_id: string;
  name: string;
  model: string | null;
  is_active: boolean;
  auto_reply: boolean;
  created_at: string;
}

interface CorridaFila {
  ai_agent_id: string | null;
  org_id: string;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: string;
}

const VACIO: ResumenConsumo = {
  corridas: 0,
  inputTokens: 0,
  outputTokens: 0,
  costoUsd: 0,
};

const ESTADOS = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "pausados", label: "Pausados" },
] as const;

/** Ventana de consumo que mira la agencia para facturar y detectar desvíos */
const DIAS = 30;

/** Corte ISO de hace N días, para acotar las corridas del período */
function desdeHace(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

export default async function ConsolaAgentesPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; estado?: string }>;
}) {
  const { org: orgParam, estado: estadoParam } = await searchParams;
  const session = await requireAgencyContext();
  const supabase = await createClient();

  const orgsRes = await supabase
    .from("organizations")
    .select("id, name, status")
    .eq("agency_id", session.agency.id)
    .order("name");

  // Con la consulta caída la pantalla anuncia "todavía no tienes
  // subcuentas" a alguien que tiene una cartera entera.
  const orgsData = exigirLectura(orgsRes, "las subcuentas");

  const subcuentas = (orgsData ?? []) as SubcuentaFila[];

  if (subcuentas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <Encabezado />
        <EmptyState
          icon={Building2}
          title="Todavía no tienes subcuentas"
          description="Los agentes de IA viven dentro de cada cliente. Crea la primera subcuenta y desde aquí administrarás sus agentes sin cambiar de cuenta."
          action={
            <Link href="/agencia/nueva" className={buttonClasses("primary", "md")}>
              Crear subcuenta
            </Link>
          }
        />
      </div>
    );
  }

  const ids = subcuentas.map((o) => o.id);
  const desde = desdeHace(DIAS);

  const [{ data: agentesData }, { data: conocimientoData }, { data: corridasData }] =
    await Promise.all([
      supabase
        .from("ai_agents")
        .select("id, org_id, name, model, is_active, auto_reply, created_at")
        .in("org_id", ids)
        .order("name"),
      supabase
        .from("ai_agent_knowledge")
        .select("ai_agent_id")
        .in("org_id", ids),
      supabase
        .from("ai_agent_runs")
        .select("ai_agent_id, org_id, input_tokens, output_tokens, created_at")
        .in("org_id", ids)
        .gte("created_at", desde),
    ]);

  const agentes = (agentesData ?? []) as AgenteFila[];
  const conocimiento = (conocimientoData ?? []) as { ai_agent_id: string }[];
  const corridas = (corridasData ?? []) as CorridaFila[];

  const nombrePorOrg = new Map(subcuentas.map((o) => [o.id, o.name]));
  const modeloPorAgente = new Map(agentes.map((a) => [a.id, a.model]));

  // Entradas de base de conocimiento por agente
  const entradasPorAgente = new Map<string, number>();
  for (const k of conocimiento) {
    entradasPorAgente.set(k.ai_agent_id, (entradasPorAgente.get(k.ai_agent_id) ?? 0) + 1);
  }

  // ai_agent_runs no guarda el modelo: se toma el del agente que la ejecutó
  const consumo = consumoPor(
    corridas
      .filter((c) => c.ai_agent_id)
      .map((c) => ({
        ai_agent_id: c.ai_agent_id as string,
        model: modeloPorAgente.get(c.ai_agent_id as string) ?? null,
        input_tokens: c.input_tokens,
        output_tokens: c.output_tokens,
      })),
    (c) => c.ai_agent_id
  );

  const orgFiltrada = orgParam && ids.includes(orgParam) ? orgParam : null;
  const estado =
    estadoParam === "activos" || estadoParam === "pausados" ? estadoParam : "todos";

  const visibles = agentes.filter((a) => {
    if (orgFiltrada && a.org_id !== orgFiltrada) return false;
    if (estado === "activos" && !a.is_active) return false;
    if (estado === "pausados" && a.is_active) return false;
    return true;
  });

  const activos = visibles.filter((a) => a.is_active).length;
  const conAuto = visibles.filter((a) => a.auto_reply).length;
  const costoTotal = visibles.reduce(
    (sum, a) => sum + (consumo.get(a.id) ?? VACIO).costoUsd,
    0
  );

  const linkEstado = (valor: string) => {
    const params = new URLSearchParams();
    if (orgFiltrada) params.set("org", orgFiltrada);
    if (valor !== "todos") params.set("estado", valor);
    const query = params.toString();
    return query ? `/agencia/consola/agentes?${query}` : "/agencia/consola/agentes";
  };

  return (
    <div className="flex flex-col gap-6">
      <Encabezado />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={Bot} label="Agentes" value={String(visibles.length)} hint={`En ${subcuentas.length} subcuentas`} />
        <Kpi icon={Sparkles} label="Activos" value={String(activos)} hint={`${visibles.length - activos} pausados`} />
        <Kpi icon={Zap} label="Respuesta automática" value={String(conAuto)} hint="Contestan sin intervención" />
        <Kpi
          icon={Building2}
          label={`Costo ${DIAS} días`}
          value={formatUsd(costoTotal)}
          hint="Consumo de tokens del período"
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {ESTADOS.map((e) => (
            <Link
              key={e.value}
              href={linkEstado(e.value)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150",
                estado === e.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
            >
              {e.label}
            </Link>
          ))}
        </div>

        <form method="get" className="flex items-end gap-2">
          {estado !== "todos" && <input type="hidden" name="estado" value={estado} />}
          <Select
            name="org"
            defaultValue={orgFiltrada ?? ""}
            aria-label="Filtrar por subcuenta"
            className="h-9 w-56"
          >
            <option value="">Todas las subcuentas</option>
            {subcuentas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClasses("secondary", "sm")}>
            Filtrar
          </button>
        </form>
      </div>

      {agentes.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Ninguna subcuenta tiene agentes"
          description="Cada cliente puede tener uno o más agentes de IA. Se crean dentro de la subcuenta, en Agentes de IA; luego los configuras y monitoreas desde esta consola."
        />
      ) : visibles.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Sin agentes con ese filtro"
          description="Ningún agente coincide con la subcuenta o el estado seleccionado. Prueba con otro filtro."
          action={
            <Link href="/agencia/consola/agentes" className={buttonClasses("secondary", "sm")}>
              Limpiar filtros
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 font-medium">Agente</th>
                    <th className="py-2 font-medium">Subcuenta</th>
                    <th className="py-2 font-medium">Modelo</th>
                    <th className="py-2 font-medium">Estado</th>
                    <th className="py-2 font-medium">Respuesta automática</th>
                    <th className="py-2 font-medium">Base de conocimiento</th>
                    <th className="py-2 text-right font-medium">Corridas {DIAS}d</th>
                    <th className="py-2 text-right font-medium">Costo {DIAS}d</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((a) => {
                    const uso = consumo.get(a.id) ?? VACIO;
                    const entradas = entradasPorAgente.get(a.id) ?? 0;
                    return (
                      <tr
                        key={a.id}
                        className="border-b border-border transition-colors duration-150 hover:bg-muted/50"
                      >
                        <td className="py-2.5 font-medium">
                          <Link
                            href={`/agencia/consola/agentes/${a.id}?org=${a.org_id}`}
                            className="hover:underline"
                          >
                            {a.name}
                          </Link>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {nombrePorOrg.get(a.org_id) ?? "—"}
                        </td>
                        <td className="py-2.5">
                          <Badge variant="outline">{nombreModelo(a.model)}</Badge>
                        </td>
                        <td className="py-2.5">
                          <Badge variant={a.is_active ? "success" : "outline"}>
                            {a.is_active ? "Activo" : "Pausado"}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          {a.auto_reply ? (
                            <Badge variant="default">Activada</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {entradas === 0
                            ? "Sin entradas"
                            : `${entradas} ${entradas === 1 ? "entrada" : "entradas"}`}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{uso.corridas}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatUsd(uso.costoUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Encabezado() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Agentes de IA</h1>
      <p className="text-sm text-muted-foreground">
        Configura los agentes de todos tus clientes sin salir de la consola.
      </p>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Bot;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-4" />
          <span className="text-xs">{label}</span>
        </div>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

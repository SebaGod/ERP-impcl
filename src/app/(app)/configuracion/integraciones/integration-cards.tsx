"use client";

import { useActionState, useState, useTransition } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  Plug,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  categories,
  statusLabels,
  statusVariants,
  type IntegrationRow,
  type Provider,
} from "@/lib/channels/providers";
import { providerIcons } from "@/lib/channels/brand-icons";
import {
  alternarIntegracion,
  conectarConCredenciales,
  desconectarIntegracion,
  type ActionState,
} from "./actions";

const initialState: ActionState = { error: null };

interface Props {
  providers: Provider[];
  conectadas: IntegrationRow[];
}

export function IntegrationCards({ providers, conectadas }: Props) {
  const [abierto, setAbierto] = useState<Provider | null>(null);
  const porProveedor = new Map(conectadas.map((c) => [c.provider, c]));

  return (
    <>
      {categories.map((categoria) => {
        const delGrupo = providers.filter((p) => p.category === categoria);
        if (delGrupo.length === 0) return null;

        return (
          <section key={categoria} className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {categoria}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {delGrupo.map((provider) => (
                <ProviderCard
                  key={provider.id}
                  provider={provider}
                  integracion={porProveedor.get(provider.id)}
                  onAbrir={() => setAbierto(provider)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {abierto && (
        <ConnectModal
          provider={abierto}
          integracion={porProveedor.get(abierto.id)}
          onCerrar={() => setAbierto(null)}
        />
      )}
    </>
  );
}

function ProviderCard({
  provider,
  integracion,
  onAbrir,
}: {
  provider: Provider;
  integracion?: IntegrationRow;
  onAbrir: () => void;
}) {
  const conectada = Boolean(integracion);
  const Icon = providerIcons[provider.id];

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: provider.accent }}
          >
            {Icon ? <Icon className="size-5" /> : provider.name.charAt(0)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{provider.name}</p>
            {integracion ? (
              <Badge variant={statusVariants[integracion.status]}>
                {statusLabels[integracion.status]}
              </Badge>
            ) : provider.disponible ? (
              <span className="text-xs text-muted-foreground">Sin conectar</span>
            ) : (
              <Badge variant="outline">Próximamente</Badge>
            )}
          </div>
        </div>
      </div>

      <p className="flex-1 text-sm text-muted-foreground">
        {provider.shortDescription}
      </p>

      {integracion?.last_error && (
        <p className="rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">
          {integracion.last_error}
        </p>
      )}

      {integracion?.last_event_at && (
        <p className="text-xs text-muted-foreground">
          Último mensaje: {formatDateTime(integracion.last_event_at)}
        </p>
      )}

      <div>
        <Button
          variant={conectada ? "secondary" : "primary"}
          size="sm"
          disabled={!provider.disponible}
          onClick={onAbrir}
        >
          {conectada ? (
            <>
              <Check className="size-4" /> Administrar
            </>
          ) : (
            <>
              <Plug className="size-4" /> Conectar
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ConnectModal({
  provider,
  integracion,
  onCerrar,
}: {
  provider: Provider;
  integracion?: IntegrationRow;
  onCerrar: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    conectarConCredenciales,
    initialState
  );
  const [isPending, startTransition] = useTransition();
  const Icon = providerIcons[provider.id];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onCerrar}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex items-center gap-3">
            <span
              className="flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-bold text-white"
              style={{ backgroundColor: provider.accent }}
            >
              {Icon ? <Icon className="size-6" /> : provider.name.charAt(0)}
            </span>
            <div>
              <h2 className="font-semibold">{provider.name}</h2>
              <p className="text-xs text-muted-foreground">{provider.category}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onCerrar} aria-label="Cerrar">
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <p className="text-sm text-muted-foreground">
            {provider.longDescription}
          </p>

          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Qué ganas
            </p>
            <ul className="flex flex-col gap-1.5">
              {provider.features.map((f) => (
                <li key={f} className="flex gap-2 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {provider.requisitos && provider.requisitos.length > 0 && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Antes de empezar
              </p>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
                {provider.requisitos.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {integracion ? (
            <ManageConnection
              integracion={integracion}
              isPending={isPending}
              startTransition={startTransition}
              onCerrar={onCerrar}
            />
          ) : provider.authType === "credenciales" ? (
            <form action={formAction} className="flex flex-col gap-3">
              <input type="hidden" name="provider" value={provider.id} />
              {provider.credentialFields.map((campo) => (
                <div key={campo.key} className="flex flex-col gap-1.5">
                  <Label htmlFor={`f-${campo.key}`}>
                    {campo.label}
                    {campo.required ? " *" : ""}
                  </Label>
                  <Input
                    id={`f-${campo.key}`}
                    name={campo.key}
                    type={campo.type}
                    placeholder={campo.placeholder}
                    required={campo.required}
                  />
                  {campo.help && (
                    <p className="text-xs text-muted-foreground">{campo.help}</p>
                  )}
                </div>
              ))}
              {state.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              {state.ok && (
                <p className="text-sm text-success">Conexión guardada.</p>
              )}
              <Button type="submit" disabled={pending}>
                {pending ? "Conectando…" : "Conectar"}
              </Button>
            </form>
          ) : (
            <PendienteDeApp provider={provider} />
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Conexión por OAuth / Embedded Signup: el botón real vive detrás de la app de
 * Meta. Mientras no esté configurada, se dice explícitamente en vez de mostrar
 * un botón que no hace nada.
 */
function PendienteDeApp({ provider }: { provider: Provider }) {
  const esMeta = provider.authType === "embedded_signup" || provider.id !== "google_calendar";

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
        <p className="mb-1 font-medium text-foreground">
          Conexión en un clic (pendiente de habilitar)
        </p>
        <p>
          {provider.authType === "embedded_signup"
            ? "Se conectará con el flujo oficial de Meta: eliges tu número y quedas operativo, sin pegar tokens ni salir de aquí."
            : "Se conectará autorizando la cuenta en una ventana del proveedor y volviendo aquí."}
        </p>
        <p className="mt-2">
          Falta terminar de configurar {esMeta ? "la aplicación de Meta" : "la aplicación del proveedor"}.
        </p>
      </div>
      <Button variant="secondary" size="sm" disabled>
        <ExternalLink className="size-4" />
        Conectar {provider.name}
      </Button>
    </div>
  );
}

function ManageConnection({
  integracion,
  isPending,
  startTransition,
  onCerrar,
}: {
  integracion: IntegrationRow;
  isPending: boolean;
  startTransition: (cb: () => void) => void;
  onCerrar: () => void;
}) {
  const pausada = integracion.status === "pausada";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <dl className="flex flex-col gap-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Estado</dt>
          <dd>
            <Badge variant={statusVariants[integracion.status]}>
              {statusLabels[integracion.status]}
            </Badge>
          </dd>
        </div>
        {integracion.external_id && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Cuenta</dt>
            <dd className="truncate font-mono text-xs">
              {integracion.external_id}
            </dd>
          </div>
        )}
        {integracion.connected_at && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Conectada</dt>
            <dd>{formatDateTime(integracion.connected_at)}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await alternarIntegracion(integracion.id, !pausada);
              onCerrar();
            })
          }
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : pausada ? (
            <Play className="size-4" />
          ) : (
            <Pause className="size-4" />
          )}
          {pausada ? "Reactivar" : "Pausar"}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={isPending}
          onClick={() => {
            if (
              !window.confirm(
                "Se eliminará la conexión y sus credenciales. ¿Continuar?"
              )
            ) {
              return;
            }
            startTransition(async () => {
              await desconectarIntegracion(integracion.id);
              onCerrar();
            });
          }}
        >
          <Trash2 className="size-4" /> Desconectar
        </Button>
      </div>
      <p className={cn("text-xs", pausada ? "text-muted-foreground" : "text-success")}>
        {pausada
          ? "Pausada: no se reciben ni envían mensajes por este canal."
          : "Activa: los mensajes de este canal llegan a tu inbox."}
      </p>
    </div>
  );
}

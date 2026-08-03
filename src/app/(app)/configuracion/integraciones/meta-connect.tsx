"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { ExternalLink, Loader2, TriangleAlert } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationRow, Provider } from "@/lib/channels/providers";
import {
  conectarWhatsappManual,
  elegirPaginaMeta,
  listarPaginasMeta,
  type EstadoMeta,
  type PaginaElegible,
} from "./meta-actions";

const estadoInicial: EstadoMeta = { error: null };

/**
 * Conexión de los canales de Meta.
 *
 * WhatsApp y las redes se conectan distinto:
 *
 *  - Instagram y Messenger van por OAuth: el cliente autoriza en Facebook,
 *    vuelve, y elige cuál de sus páginas quiere enlazar.
 *  - WhatsApp, mientras Meta no apruebe nuestra aplicación como Tech
 *    Provider, se conecta pegando el token permanente de un System User.
 *    Es más incómodo, pero es lo que permite operar HOY en lugar de
 *    esperar semanas a una revisión.
 */
export function ConectarMeta({
  provider,
  integracion,
  metaListo,
}: {
  provider: Provider;
  integracion?: IntegrationRow;
  metaListo: boolean;
}) {
  if (!metaListo) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-warning/40 bg-warning/5 p-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium">Falta configurar el servidor</p>
          <p className="text-muted-foreground">
            El administrador de la plataforma tiene que cargar las credenciales
            de la aplicación de Meta antes de que puedas conectar este canal.
            Puede ver qué falta en el panel de agencia, en Configuración.
          </p>
        </div>
      </div>
    );
  }

  // Autorizó en Facebook pero todavía no eligió qué página conectar
  if (integracion?.status === "conectando" && provider.id !== "whatsapp") {
    return (
      <ElegirPagina provider={provider.id as "instagram" | "messenger"} />
    );
  }

  if (provider.id === "whatsapp") {
    return <WhatsappManual />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Te llevamos a Facebook para que autorices, y al volver eliges cuál de
        tus páginas quieres conectar. No guardamos tu contraseña: Meta nos
        entrega un permiso que puedes revocar cuando quieras.
      </p>
      {/* Enlace y no botón con onClick: el arranque del OAuth es una
          navegación de verdad hacia Facebook, no una acción del cliente. */}
      <a
        href={`/api/meta/oauth/start?provider=${provider.id}`}
        className={buttonClasses("primary", "md")}
      >
        <ExternalLink className="size-4" />
        Conectar con Facebook
      </a>
    </div>
  );
}

/** Elige la página (o la cuenta de Instagram) que queda enlazada */
function ElegirPagina({ provider }: { provider: "instagram" | "messenger" }) {
  const [paginas, setPaginas] = useState<PaginaElegible[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, iniciar] = useTransition();

  useEffect(() => {
    let vigente = true;
    listarPaginasMeta(provider).then((res) => {
      if (!vigente) return;
      setError(res.error);
      setPaginas(res.paginas);
    });
    return () => {
      vigente = false;
    };
  }, [provider]);

  function elegir(pageId: string) {
    iniciar(async () => {
      const res = await elegirPaginaMeta(provider, pageId);
      if (res.error) setError(res.error);
    });
  }

  if (paginas === null && !error) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Buscando tus páginas…
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">¿Cuál quieres conectar?</p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {paginas?.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">
          {provider === "instagram"
            ? "Ninguna de tus páginas tiene una cuenta profesional de Instagram asociada. Vincúlalas en Meta y vuelve a intentar."
            : "No encontramos páginas que administres con esta cuenta de Facebook."}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {(paginas ?? []).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => elegir(p.id)}
            disabled={guardando}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary hover:bg-muted disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">{p.nombre}</span>
              {p.instagramUsuario && (
                <span className="block truncate text-xs text-muted-foreground">
                  @{p.instagramUsuario}
                </span>
              )}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {guardando ? "Conectando…" : "Conectar"}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Conexión de WhatsApp con token de System User.
 *
 * Los tres datos salen del panel de desarrolladores de Meta. Se explica
 * dónde encontrar cada uno porque es el paso donde la gente se pierde, y
 * un formulario con tres campos crípticos es un formulario que nadie llena.
 */
function WhatsappManual() {
  const [state, formAction, pending] = useActionState(
    conectarWhatsappManual,
    estadoInicial
  );

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
        Los tres datos están en{" "}
        <span className="font-medium text-foreground">
          developers.facebook.com
        </span>{" "}
        → tu aplicación → WhatsApp → Configuración de la API. El token
        permanente se genera desde el portafolio de negocios, en Usuarios del
        sistema.
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-phone">Identificador del número *</Label>
        <Input
          id="wa-phone"
          name="phone_number_id"
          inputMode="numeric"
          placeholder="123456789012345"
          required
        />
        <p className="text-xs text-muted-foreground">
          El &quot;Phone number ID&quot;, no el número de teléfono.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-waba">Identificador de la cuenta de WhatsApp *</Label>
        <Input
          id="wa-waba"
          name="waba_id"
          inputMode="numeric"
          placeholder="098765432109876"
          required
        />
        <p className="text-xs text-muted-foreground">
          El &quot;WhatsApp Business Account ID&quot;.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-token">Token permanente *</Label>
        <Input id="wa-token" name="access_token" type="password" required />
        <p className="text-xs text-muted-foreground">
          Se guarda cifrado. Nadie del equipo puede volver a verlo.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-success">
          {state.aviso ?? "Conexión guardada."}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Comprobando con Meta…" : "Conectar WhatsApp"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Comprobamos las credenciales con Meta antes de guardarlas: si algo está
        mal, te lo decimos ahora y no cuando falte un mensaje.
      </p>
    </form>
  );
}

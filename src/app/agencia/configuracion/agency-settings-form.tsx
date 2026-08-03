"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Copy, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { guardarIdentidadAgencia, type ActionState } from "./actions";

const ESTADO_INICIAL: ActionState = { error: null };

/** Lo que se puede editar de la agencia (el resto lo fija la base) */
export interface IdentidadAgencia {
  nombre: string;
  logoUrl: string | null;
}

/** Misma regla que valida la acción, para avisar antes de enviar */
function esUrlDeImagen(valor: string): boolean {
  try {
    const url = new URL(valor);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Nombre y logo de la agencia.
 *
 * Los valores guardados llegan por props y el borrador vive en estado: al
 * terminar la acción el servidor vuelve a enviar la fila, las props se
 * igualan al borrador y el botón se apaga solo. No hay que sincronizar nada
 * a mano ni adivinar si quedó guardado.
 */
export function FormularioIdentidad({
  agencia,
}: {
  agencia: IdentidadAgencia;
}) {
  const [state, formAction, pending] = useActionState(
    guardarIdentidadAgencia,
    ESTADO_INICIAL
  );
  const [nombre, setNombre] = useState(agencia.nombre);
  const [logo, setLogo] = useState(agencia.logoUrl ?? "");
  const [confirmado, setConfirmado] = useState(false);
  const visto = useRef(state);

  // Solo confirmamos cuando la acción resolvió sin error, no al montar
  useEffect(() => {
    if (state === visto.current) return;
    visto.current = state;
    setConfirmado(!state.error);
  }, [state]);

  const guardadoLogo = agencia.logoUrl ?? "";
  const hayCambios =
    nombre.trim() !== agencia.nombre || logo.trim() !== guardadoLogo;

  const logoRecortado = logo.trim();
  const logoUsable = logoRecortado === "" || esUrlDeImagen(logoRecortado);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agencia-nombre">Nombre de la agencia</Label>
            <Input
              id="agencia-nombre"
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="organization"
              value={nombre}
              onChange={(e) => {
                setNombre(e.target.value);
                setConfirmado(false);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Es el nombre que ves en la barra lateral y el que aparece en las
              invitaciones que envías a tu equipo.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="agencia-logo">Logo (dirección de la imagen)</Label>
            <Input
              id="agencia-logo"
              name="logo_url"
              type="url"
              inputMode="url"
              placeholder="https://tusitio.cl/logo.png"
              value={logo}
              onChange={(e) => {
                setLogo(e.target.value);
                setConfirmado(false);
              }}
              aria-invalid={!logoUsable}
            />
            <p className="text-xs text-muted-foreground">
              El logo se guarda como enlace, no como archivo: súbelo a tu sitio
              o a tu almacenamiento y pega acá la dirección pública. Déjalo
              vacío para usar la inicial del nombre.
            </p>
            {!logoUsable && (
              <p className="text-xs text-warning">
                La dirección tiene que empezar con http:// o https://.
              </p>
            )}
          </div>
        </div>

        <VistaPrevia
          nombre={nombre.trim() || agencia.nombre}
          logo={logoUsable ? logoRecortado : ""}
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !hayCambios || !logoUsable}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
        {hayCambios ? (
          !pending && (
            <span className="text-sm text-muted-foreground">
              Hay cambios sin guardar.
            </span>
          )
        ) : (
          confirmado &&
          !pending &&
          !state.error && (
            <span className="text-sm text-success">Cambios guardados.</span>
          )
        )}
      </div>
    </form>
  );
}

/**
 * Cómo queda la marca en la barra lateral.
 *
 * Un campo de texto con una URL no dice si el logo carga, si tiene el fondo
 * correcto o si se ve contra el azul oscuro del panel. Esto sí.
 */
function VistaPrevia({ nombre, logo }: { nombre: string; logo: string }) {
  // Se guarda cuál dirección falló, no un simple "está rota": así cada
  // dirección nueva estrena su intento de carga sin resetear nada a mano.
  const [urlFallida, setUrlFallida] = useState<string | null>(null);
  const roto = urlFallida === logo;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-foreground">Vista previa</p>
      <div className="flex items-center gap-2.5 rounded-xl border border-tower-border bg-tower px-4 py-3.5">
        {logo && !roto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={logo}
            src={logo}
            alt={nombre}
            onError={() => setUrlFallida(logo)}
            className="size-8 shrink-0 rounded-lg object-contain"
          />
        ) : (
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-tower-accent text-sm font-bold text-white">
            {nombre.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-tower-foreground">
            {nombre}
          </p>
          <p className="truncate text-[11px] text-tower-muted">
            Panel de agencia
          </p>
        </div>
      </div>
      {logo && roto && (
        <p className="flex items-start gap-1.5 text-xs text-warning">
          <ImageOff className="mt-0.5 size-3.5 shrink-0" />
          No pudimos cargar esa imagen. Revisa que la dirección sea pública y
          apunte a un archivo de imagen.
        </p>
      )}
    </div>
  );
}

/**
 * Identificador de la agencia con botón de copiado.
 *
 * Se muestra porque es lo que identifica a la agencia en la base y en
 * cualquier consulta de soporte; no se edita porque ninguna acción del panel
 * lo cambia.
 */
export function CampoIdentificador({ slug }: { slug: string }) {
  const [copiado, setCopiado] = useState(false);
  const [falloCopia, setFalloCopia] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const id = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(id);
  }, [copiado]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(slug);
      setFalloCopia(false);
      setCopiado(true);
    } catch {
      // Sin HTTPS o sin permiso no hay portapapeles: mejor avisar que
      // dejar a la persona esperando una confirmación que no va a llegar.
      setFalloCopia(true);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm">
          {slug}
        </code>
        <button
          type="button"
          onClick={copiar}
          aria-label="Copiar identificador"
          className={cn(
            "shrink-0 rounded-lg border border-border p-2 transition-colors",
            copiado
              ? "text-success"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {copiado ? (
            <Check className="size-4" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      {falloCopia && (
        <p className="text-xs text-warning">
          Tu navegador no dejó copiar. Selecciónalo y cópialo a mano.
        </p>
      )}
    </div>
  );
}

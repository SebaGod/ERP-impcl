"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfigRegional } from "@/lib/locale";
import { CamposRegion } from "@/lib/region/campos";
import { Textarea } from "@/components/ui/textarea";
import type { FaltanteDte } from "@/lib/dte/validacion";
import {
  updateDatosTributarios,
  updateOrganization,
  updateRegion,
  type ActionState,
} from "./actions";

const initialState: ActionState = { error: null };

export function OrgForm({ name, rut }: { name: string; rut: string }) {
  const [state, formAction, pending] = useActionState(
    updateOrganization,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-name">Nombre</Label>
        <Input id="org-name" name="name" defaultValue={name} required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-rut">RUT</Label>
        <Input
          id="org-rut"
          name="rut"
          defaultValue={rut}
          placeholder="76.543.210-3"
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>
    </form>
  );
}

export interface DatosTributarios {
  razon_social: string;
  giro: string;
  acteco: string;
  direccion: string;
  comuna: string;
  ciudad: string;
}

/**
 * Lo que el SII exige del emisor en cada boleta y factura.
 *
 * Cada campo dice para qué sirve y dónde encontrarlo. No es relleno: la
 * mayoría de estos datos están en la carpeta tributaria y nadie se los
 * sabe de memoria, así que sin la pista el campo queda vacío.
 */
export function DatosTributariosForm({
  datos,
  faltantes,
}: {
  datos: DatosTributarios;
  faltantes: FaltanteDte[];
}) {
  const [state, formAction, pending] = useActionState(
    updateDatosTributarios,
    initialState
  );

  // Los faltantes vienen del servidor y se recalculan al guardar; el
  // aviso desaparece solo cuando de verdad está completo.
  const falta = (campo: string) => faltantes.some((f) => f.campo === campo);
  // El RUT lo exige el SII igual que el resto, pero se edita arriba: si
  // se cuenta entre los faltantes y no está en este formulario, el
  // usuario busca un campo que no existe.
  const avisoRut = faltantes.find((f) => f.campo === "rut");

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {avisoRut && (
        <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
          {avisoRut.mensaje}. Se completa más arriba, en{" "}
          <strong>Perfil de empresa</strong>.
        </p>
      )}

      <Campo
        id="org-razon-social"
        name="razon_social"
        label="Razón social"
        defaultValue={datos.razon_social}
        falta={falta("razon_social")}
        ayuda="El nombre legal con que estás inscrito, si es distinto del nombre de fantasía."
      />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="org-giro">
          Giro {falta("giro") && <Pendiente />}
        </Label>
        <Textarea
          id="org-giro"
          name="giro"
          rows={2}
          defaultValue={datos.giro}
          placeholder="Servicios de impresión y publicidad"
        />
        <Ayuda>
          El giro con que estás inscrito en el SII, tal como aparece en tu
          carpeta tributaria. Va impreso en cada documento.
        </Ayuda>
      </div>

      <Campo
        id="org-acteco"
        name="acteco"
        label="Código de actividad económica"
        defaultValue={datos.acteco}
        falta={falta("acteco")}
        placeholder="181200"
        inputMode="numeric"
        ayuda="Seis dígitos. Está en tu carpeta tributaria del SII, junto al giro."
      />

      <Campo
        id="org-direccion"
        name="direccion"
        label="Dirección"
        defaultValue={datos.direccion}
        falta={falta("direccion")}
        placeholder="Av. Providencia 1234, oficina 56"
        ayuda="La dirección declarada al SII, no la de despacho."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo
          id="org-comuna"
          name="comuna"
          label="Comuna"
          defaultValue={datos.comuna}
          falta={falta("comuna")}
          placeholder="Providencia"
        />
        <Campo
          id="org-ciudad"
          name="ciudad"
          label="Ciudad"
          defaultValue={datos.ciudad}
          falta={false}
          placeholder="Santiago"
        />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar datos tributarios"}
        </Button>
      </div>
    </form>
  );
}

function Campo({
  id,
  name,
  label,
  defaultValue,
  falta,
  placeholder,
  inputMode,
  ayuda,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  falta: boolean;
  placeholder?: string;
  inputMode?: "numeric";
  ayuda?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>
        {label} {falta && <Pendiente />}
      </Label>
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        inputMode={inputMode}
      />
      {ayuda && <Ayuda>{ayuda}</Ayuda>}
    </div>
  );
}

function Pendiente() {
  return (
    <span className="ml-1 rounded-md bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
      Falta
    </span>
  );
}

function Ayuda({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

/** Zona horaria, moneda e idioma con que se lee toda la aplicación */
export function RegionForm({
  region,
  instanteEjemplo,
}: {
  region: ConfigRegional;
  instanteEjemplo: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateRegion,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {/* La key remonta los campos cuando cambia lo guardado: si el
          servidor normalizó algo ("clp" → "CLP"), en pantalla queda lo
          que quedó en la base y no lo que se tipeó. */}
      <CamposRegion
        key={`${region.timezone}|${region.currency}|${region.locale}`}
        guardada={region}
        instanteEjemplo={instanteEjemplo}
        idPrefix="org-region"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && !state.error && (
        <p className="text-sm text-success">{state.success}</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar región"}
        </Button>
      </div>
    </form>
  );
}

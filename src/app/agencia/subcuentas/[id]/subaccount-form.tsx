"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { statusLabels, type SubaccountStatus } from "@/lib/agency/types";
import type { ConfigRegional } from "@/lib/locale";
import { CamposRegion } from "@/lib/region/campos";
import { applySnapshot, updateSubaccount, type ActionState } from "../../actions";
import { updateSubaccountRegion } from "./region-actions";

const initialState: ActionState = { error: null };

const statusOptions: SubaccountStatus[] = ["activa", "prueba", "pausada"];

/** Datos de la ficha comercial que edita el formulario */
interface SubaccountFormOrg {
  id: string;
  status: string;
  plan: string | null;
  monthly_fee: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
}

/** Ficha comercial de una subcuenta: estado, plan, cobro y contacto */
export function SubaccountForm({
  org,
  moneda,
  cobroFormateado,
}: {
  org: SubaccountFormOrg;
  /** Moneda con que se leen los montos de esta ficha */
  moneda: string;
  /**
   * El cobro ya formateado en el servidor. Llega hecho porque estos tres
   * campos son texto libre en la base: si alguno quedó inválido, `Intl`
   * lanza, y no vale la pena que eso pase dentro del navegador.
   */
  cobroFormateado: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    updateSubaccount,
    initialState
  );
  const [saved, setSaved] = useState(false);
  const seen = useRef(state);

  // Solo confirmamos cuando la acción resolvió sin error (no al montar)
  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    setSaved(!state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="org_id" value={org.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-status">Estado</Label>
          <Select id="sub-status" name="status" defaultValue={org.status}>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {statusLabels[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-plan">Plan</Label>
          <Input
            id="sub-plan"
            name="plan"
            placeholder="Plan Pro"
            defaultValue={org.plan ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-fee">Cobro mensual</Label>
          <Input
            id="sub-fee"
            name="monthly_fee"
            type="number"
            min="0"
            step="1000"
            defaultValue={org.monthly_fee}
          />
          <p className="text-xs text-muted-foreground">
            Lo que le facturas a este cliente cada mes. Se lee en {moneda}, la
            moneda de la subcuenta.
            {cobroFormateado && ` Hoy: ${cobroFormateado}.`}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-contact-name">Contacto</Label>
          <Input
            id="sub-contact-name"
            name="contact_name"
            placeholder="Nombre y apellido"
            defaultValue={org.contact_name ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-contact-email">Email de contacto</Label>
          <Input
            id="sub-contact-email"
            name="contact_email"
            type="email"
            placeholder="contacto@empresa.cl"
            defaultValue={org.contact_email ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sub-contact-phone">Teléfono de contacto</Label>
          <Input
            id="sub-contact-phone"
            name="contact_phone"
            type="tel"
            placeholder="+56 9 1234 5678"
            defaultValue={org.contact_phone ?? ""}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="sub-notes">Notas</Label>
          <Textarea
            id="sub-notes"
            name="notes"
            rows={3}
            placeholder="Acuerdos, condiciones de pago, contexto del cliente…"
            defaultValue={org.notes ?? ""}
          />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar cambios"}
        </Button>
        {saved && !pending && !state.error && (
          <span className="text-sm text-muted-foreground">Cambios guardados</span>
        )}
      </div>
    </form>
  );
}

/**
 * Región de la subcuenta editada desde la agencia.
 *
 * La agencia la necesita porque el cliente no siempre entra a su propia
 * configuración: la cuenta se deja lista antes de entregarla, y una
 * subcuenta peruana entregada con horario de Santiago agenda mal desde
 * la primera cita.
 */
export function RegionSubcuentaForm({
  orgId,
  region,
  instanteEjemplo,
}: {
  orgId: string;
  region: ConfigRegional;
  instanteEjemplo: string;
}) {
  const [state, formAction, pending] = useActionState(
    updateSubaccountRegion,
    initialState
  );
  const [saved, setSaved] = useState(false);
  const seen = useRef(state);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    setSaved(!state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      {/* Remonta los campos cuando cambia lo guardado, para que en
          pantalla quede lo normalizado por el servidor. */}
      <CamposRegion
        key={`${region.timezone}|${region.currency}|${region.locale}`}
        guardada={region}
        instanteEjemplo={instanteEjemplo}
        idPrefix="sub-region"
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Guardando…" : "Guardar región"}
        </Button>
        {saved && !pending && !state.error && (
          <span className="text-sm text-muted-foreground">Cambios guardados</span>
        )}
      </div>
    </form>
  );
}

/** Plantilla disponible en la agencia */
interface TemplateOption {
  id: string;
  name: string;
  description: string | null;
}

/** Aplica una plantilla de la agencia sobre esta subcuenta (aditivo) */
export function ApplyTemplateForm({
  orgId,
  templates,
}: {
  orgId: string;
  templates: TemplateOption[];
}) {
  const [state, formAction, pending] = useActionState(
    applySnapshot,
    initialState
  );
  const [applied, setApplied] = useState(false);
  const seen = useRef(state);

  useEffect(() => {
    if (state === seen.current) return;
    seen.current = state;
    setApplied(!state.error);
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="org_id" value={orgId} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="apply-snapshot">Plantilla</Label>
        <Select id="apply-snapshot" name="snapshot_id" required>
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.description
                ? `${template.name} — ${template.description}`
                : template.name}
            </option>
          ))}
        </Select>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Aplicando…" : "Aplicar"}
        </Button>
        {applied && !pending && !state.error && (
          <span className="text-sm text-muted-foreground">
            Plantilla aplicada
          </span>
        )}
      </div>
    </form>
  );
}

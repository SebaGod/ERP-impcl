"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { statusLabels, type SubaccountStatus } from "@/lib/agency/types";
import { createSubaccount, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

const statusOptions: SubaccountStatus[] = ["activa", "prueba", "pausada"];

/** Bloque de campos con subtítulo, separado del anterior por una línea */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

/** Campo con etiqueta y texto de ayuda opcional */
function Field({
  htmlFor,
  label,
  hint,
  className,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Alta de subcuenta con onboarding completo en un solo paso */
export function NewSubaccountForm({
  snapshots,
}: {
  snapshots: { id: string; name: string; description: string | null }[];
}) {
  const [state, formAction, pending] = useActionState(
    createSubaccount,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Section
        title="Datos del cliente"
        description="Identifican la subcuenta dentro de tu cartera y aparecen en sus documentos."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field htmlFor="sub-name" label="Nombre del cliente *">
            <Input
              id="sub-name"
              name="name"
              required
              placeholder="Imprenta San Martín"
              autoComplete="organization"
            />
          </Field>
          <Field
            htmlFor="sub-rut"
            label="RUT (opcional)"
            hint="Validamos el dígito verificador."
          >
            <Input id="sub-rut" name="rut" placeholder="76.543.210-3" />
          </Field>
        </div>
      </Section>

      <Section
        title="Configuración inicial"
        description="Con qué llega poblada la subcuenta el primer día."
      >
        <Field
          htmlFor="sub-snapshot"
          label="Plantilla"
          hint={
            snapshots.length === 0
              ? "El catálogo por defecto trae etapas de producción, productos, insumos y categorías de gastos de una imprenta tipo. Cuando tengas una subcuenta afinada, captúrala como plantilla para que los próximos clientes nazcan con tu configuración."
              : "El catálogo por defecto es el estándar de imprenta que trae el sistema. Una plantilla replica la configuración de una subcuenta que ya afinaste: sus etapas, embudos, agentes de IA, catálogo y proveedores. Nunca se copian datos de clientes."
          }
        >
          <Select id="sub-snapshot" name="snapshot_id" defaultValue="">
            <option value="">Catálogo por defecto (imprenta)</option>
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.name}
                {snapshot.description ? ` — ${snapshot.description}` : ""}
              </option>
            ))}
          </Select>
        </Field>
      </Section>

      <Section
        title="Plan y cobro"
        description="Opcional. Alimenta el MRR y los estados del panel de agencia."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field htmlFor="sub-status" label="Estado">
            <Select id="sub-status" name="status" defaultValue="activa">
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="sub-plan" label="Plan">
            <Input id="sub-plan" name="plan" placeholder="Plan Pro" />
          </Field>
          <Field
            htmlFor="sub-fee"
            label="Cobro mensual"
            hint="En pesos, sin IVA. Se suma al MRR de la agencia."
            className="sm:col-span-2"
          >
            <Input
              id="sub-fee"
              name="monthly_fee"
              type="number"
              min="0"
              step="1000"
              inputMode="numeric"
              placeholder="150000"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Contacto del cliente"
        description="Opcional. Con quién hablas en esta cuenta cuando necesitas algo."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            htmlFor="sub-contact-name"
            label="Nombre"
            className="sm:col-span-2"
          >
            <Input
              id="sub-contact-name"
              name="contact_name"
              placeholder="María Fuentes"
              autoComplete="off"
            />
          </Field>
          <Field htmlFor="sub-contact-email" label="Correo">
            <Input
              id="sub-contact-email"
              name="contact_email"
              type="email"
              placeholder="maria@imprenta.cl"
              autoComplete="off"
            />
          </Field>
          <Field htmlFor="sub-contact-phone" label="Teléfono">
            <Input
              id="sub-contact-phone"
              name="contact_phone"
              placeholder="+56 9 1234 5678"
              autoComplete="off"
            />
          </Field>
        </div>
      </Section>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear subcuenta"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Al crearla vuelves al panel de agencia, con la subcuenta lista para
          entrar.
        </p>
      </div>
    </form>
  );
}

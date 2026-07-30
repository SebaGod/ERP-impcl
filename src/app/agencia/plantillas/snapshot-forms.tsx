"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createSnapshot, deleteSnapshot, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

/** Captura la configuración de una subcuenta como plantilla reutilizable */
export function CreateSnapshotForm({
  orgs,
}: {
  orgs: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createSnapshot,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="snapshot-org">Subcuenta a capturar *</Label>
        <Select id="snapshot-org" name="org_id" required defaultValue="">
          <option value="" disabled>
            Elige una subcuenta
          </option>
          {orgs.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Conviene capturar la subcuenta que ya tengas afinada: será el molde de
          los próximos clientes.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="snapshot-name">Nombre de la plantilla *</Label>
        <Input
          id="snapshot-name"
          name="name"
          required
          placeholder="Imprenta estándar"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="snapshot-description">Descripción (opcional)</Label>
        <Textarea
          id="snapshot-description"
          name="description"
          rows={2}
          placeholder="Para qué tipo de cliente sirve esta plantilla."
        />
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Qué se copia</p>
        <p className="mt-1">
          Solo configuración: etapas, embudos, agentes de IA con su base de
          conocimiento, productos, insumos, categorías y proveedores.
        </p>
        <p className="mt-2 font-medium text-foreground">Qué nunca se copia</p>
        <p className="mt-1">
          Los datos del cliente: contactos, conversaciones y órdenes se quedan
          en su subcuenta.
        </p>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Capturando…" : "Capturar plantilla"}
        </Button>
      </div>
    </form>
  );
}

/** Elimina una plantilla, con confirmación previa */
export function DeleteSnapshotButton({ snapshotId }: { snapshotId: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={isPending}
      aria-label="Eliminar plantilla"
      onClick={() => {
        const ok = window.confirm(
          "¿Eliminar esta plantilla? Las subcuentas ya creadas con ella no se modifican."
        );
        if (!ok) return;
        startTransition(async () => void (await deleteSnapshot(snapshotId)));
      }}
    >
      <Trash2 className="size-4" />
      {isPending ? "Eliminando…" : "Eliminar"}
    </Button>
  );
}

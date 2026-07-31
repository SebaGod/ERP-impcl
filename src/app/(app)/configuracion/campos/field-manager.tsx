"use client";

import {
  useActionState,
  useCallback,
  useRef,
  useState,
  useTransition,
} from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  claveDesdeEtiqueta,
  fieldTypeLabels,
  type FieldEntity,
  type FieldType,
} from "@/lib/crm/custom-fields";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { crearCampo, eliminarCampo, moverCampo, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const tipos = Object.entries(fieldTypeLabels) as [FieldType, string][];

export function FieldManager({ entity }: { entity: FieldEntity }) {
  const [state, formAction, pending] = useActionState(crearCampo, initialState);
  const [etiqueta, setEtiqueta] = useState("");
  const [tipo, setTipo] = useState<FieldType>("texto");
  const formRef = useRef<HTMLFormElement>(null);

  const limpiar = useCallback(() => {
    setEtiqueta("");
    setTipo("texto");
  }, []);
  useResetOnSuccess(state, formRef, limpiar);

  const clave = claveDesdeEtiqueta(etiqueta);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-4 rounded-lg border border-border p-4"
    >
      <input type="hidden" name="entity" value={entity} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${entity}-label`}>Etiqueta</Label>
          <Input
            id={`${entity}-label`}
            name="label"
            required
            maxLength={60}
            placeholder="Ej: Comuna de despacho"
            value={etiqueta}
            onChange={(e) => setEtiqueta(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Se guardará con la clave{" "}
            <span className="font-mono">{clave || "—"}</span>. Cambiar la
            etiqueta después no borra los datos.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${entity}-type`}>Tipo de dato</Label>
          <Select
            id={`${entity}-type`}
            name="field_type"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as FieldType)}
          >
            {tipos.map(([valor, texto]) => (
              <option key={valor} value={valor}>
                {texto}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {tipo === "seleccion" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${entity}-options`}>Opciones</Label>
          <Textarea
            id={`${entity}-options`}
            name="options"
            rows={4}
            placeholder={"Una opción por línea\nSantiago\nValparaíso"}
          />
          <p className="text-xs text-muted-foreground">
            Una opción por línea. Se necesitan al menos dos.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${entity}-help`}>Texto de ayuda (opcional)</Label>
        <Input
          id={`${entity}-help`}
          name="help"
          maxLength={120}
          placeholder="Aparece bajo el campo al llenar la ficha"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="required"
          className="size-4 rounded border-border accent-primary"
        />
        Obligatorio al guardar la ficha
      </label>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Agregando…" : "Agregar campo"}
        </Button>
      </div>
    </form>
  );
}

interface FieldRowActionsProps {
  id: string;
  esPrimero: boolean;
  esUltimo: boolean;
}

export function FieldRowActions({
  id,
  esPrimero,
  esUltimo,
}: FieldRowActionsProps) {
  const [pending, startTransition] = useTransition();

  function mover(direccion: "arriba" | "abajo") {
    startTransition(async () => {
      await moverCampo(id, direccion);
    });
  }

  function eliminar() {
    if (
      !window.confirm(
        "¿Eliminar este campo? Dejará de aparecer en las fichas. Los datos ya guardados se conservan."
      )
    ) {
      return;
    }
    startTransition(async () => {
      await eliminarCampo(id);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => mover("arriba")}
        disabled={pending || esPrimero}
        title="Subir"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronUp className="size-4" />
      </button>
      <button
        type="button"
        onClick={() => mover("abajo")}
        disabled={pending || esUltimo}
        title="Bajar"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
      >
        <ChevronDown className="size-4" />
      </button>
      <button
        type="button"
        onClick={eliminar}
        disabled={pending}
        title="Eliminar campo"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

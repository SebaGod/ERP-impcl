"use client";

import { useActionState, useCallback, useRef, useState, useTransition } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import {
  actualizarEtiqueta,
  crearEtiqueta,
  eliminarEtiqueta,
  type ActionState,
} from "./actions";

export interface TagDef {
  id: string;
  key: string;
  label: string;
  color: string;
}

const initialState: ActionState = { error: null };

const colorInputClasses =
  "h-9 w-14 cursor-pointer rounded border border-border bg-transparent";

export function TagManager() {
  const [state, formAction, pending] = useActionState(
    crearEtiqueta,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor="tag-label">Nombre</Label>
        <Input
          id="tag-label"
          name="label"
          placeholder="Cliente frecuente"
          maxLength={40}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tag-color">Color</Label>
        <input
          id="tag-color"
          type="color"
          name="color"
          defaultValue="#64748b"
          className={colorInputClasses}
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Creando…" : "Crear etiqueta"}
      </Button>
      {state.error && (
        <p className="text-sm text-destructive sm:ml-2">{state.error}</p>
      )}
    </form>
  );
}

interface TagRowProps {
  tag: TagDef;
  usos: number;
}

export function TagRow({ tag, usos }: TagRowProps) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, startEliminar] = useTransition();

  const cerrar = useCallback(() => setEditando(false), []);

  if (editando) {
    return <TagEditForm tag={tag} onDone={cerrar} />;
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3">
      <span
        aria-hidden
        className="size-4 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: tag.color }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{tag.label}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {tag.key}
        </p>
      </div>
      <span className="text-xs text-muted-foreground">
        {usos} {usos === 1 ? "contacto" : "contactos"}
      </span>

      {confirmando ? (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">¿Eliminar?</span>
          <button
            type="button"
            onClick={() =>
              startEliminar(async () => {
                await eliminarEtiqueta(tag.id);
                setConfirmando(false);
              })
            }
            disabled={eliminando}
            className="rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-muted disabled:opacity-50"
          >
            {eliminando ? "Eliminando…" : "Sí, eliminar"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(false)}
            disabled={eliminando}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-50"
            title="Cancelar"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setEditando(true)}
            title="Editar etiqueta"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            title="Eliminar etiqueta"
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function TagEditForm({ tag, onDone }: { tag: TagDef; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(
    actualizarEtiqueta,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  // Cierra la edición solo cuando la acción resolvió sin error.
  useResetOnSuccess(state, formRef, onDone);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-primary/40 bg-muted/30 px-4 py-3"
    >
      <input type="hidden" name="id" value={tag.id} />
      <div className="flex min-w-48 flex-1 flex-col gap-1.5">
        <Label htmlFor={`label-${tag.id}`}>Nombre</Label>
        <Input
          id={`label-${tag.id}`}
          name="label"
          defaultValue={tag.label}
          maxLength={40}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`color-${tag.id}`}>Color</Label>
        <input
          id={`color-${tag.id}`}
          type="color"
          name="color"
          defaultValue={tag.color}
          className={colorInputClasses}
        />
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        <Check className="size-4" /> {pending ? "Guardando…" : "Guardar"}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        Cancelar
      </Button>
      <p className="w-full font-mono text-xs text-muted-foreground">
        {tag.key} · la clave no cambia al renombrar
      </p>
      {state.error && (
        <p className="w-full text-sm text-destructive">{state.error}</p>
      )}
    </form>
  );
}

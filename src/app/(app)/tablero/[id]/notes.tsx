"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addNote, deleteNote, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export function NoteForm({ workOrderId }: { workOrderId: string }) {
  const [state, formAction, pending] = useActionState(
    addNote.bind(null, workOrderId),
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <Textarea
        name="body"
        placeholder="Escribe una nota para el equipo…"
        className="min-h-16"
        required
      />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Agregar nota"}
        </Button>
      </div>
    </form>
  );
}

export function DeleteNoteButton({
  noteId,
  workOrderId,
}: {
  noteId: string;
  workOrderId: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      onClick={() =>
        startTransition(async () => {
          await deleteNote(noteId, workOrderId);
        })
      }
      disabled={isPending}
      title="Eliminar nota"
      className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

"use client";

import { useActionState, useRef, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { addKnowledge, deleteKnowledge, type ActionState } from "../actions";

const initialState: ActionState = { error: null };

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
}

export function KnowledgeManager({
  agentId,
  entries,
}: {
  agentId: string;
  entries: KnowledgeEntry[];
}) {
  const [state, formAction, pending] = useActionState(
    addKnowledge.bind(null, agentId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef);

  return (
    <div className="flex flex-col gap-4">
      {entries.length > 0 && (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => (
            <KnowledgeRow key={entry.id} agentId={agentId} entry={entry} />
          ))}
        </div>
      )}

      <form
        ref={formRef}
        action={formAction}
        className="flex flex-col gap-3 rounded-lg border border-dashed border-border p-4"
      >
        <p className="text-sm font-medium">Agregar entrada</p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kb-title">Título</Label>
          <Input
            id="kb-title"
            name="title"
            placeholder="Ej: Precios de tarjetas"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="kb-content">Contenido</Label>
          <Textarea
            id="kb-content"
            name="content"
            placeholder="Lo que el agente debe saber sobre este tema…"
            className="min-h-24"
            required
          />
        </div>
        {state.error && <p className="text-sm text-destructive">{state.error}</p>}
        <div>
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            <Plus className="size-4" /> {pending ? "Guardando…" : "Agregar"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function KnowledgeRow({
  agentId,
  entry,
}: {
  agentId: string;
  entry: KnowledgeEntry;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{entry.title}</p>
        <button
          onClick={() => {
            if (!window.confirm(`¿Eliminar "${entry.title}"?`)) return;
            startTransition(async () => {
              await deleteKnowledge(entry.id, agentId);
            });
          }}
          disabled={isPending}
          title="Eliminar"
          className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
        {entry.content}
      </p>
    </div>
  );
}

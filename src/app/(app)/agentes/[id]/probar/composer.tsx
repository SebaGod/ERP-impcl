"use client";

import { useActionState, useRef } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResetOnSuccess } from "@/lib/use-reset-on-success";
import { sendTestMessage, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

export function Composer({ conversationId }: { conversationId: string }) {
  const [state, formAction, pending] = useActionState(
    sendTestMessage.bind(null, conversationId),
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  useResetOnSuccess(state, formRef);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          name="body"
          placeholder="Escribe como si fueras el cliente…"
          autoComplete="off"
          required
          disabled={pending}
        />
        <Button type="submit" disabled={pending}>
          <Send className="size-4" /> {pending ? "Pensando…" : "Enviar"}
        </Button>
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

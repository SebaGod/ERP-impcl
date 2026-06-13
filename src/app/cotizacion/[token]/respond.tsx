"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function RespondButtons({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(accept: boolean) {
    const confirmText = accept
      ? "¿Aprobar esta cotización?"
      : "¿Rechazar esta cotización?";
    if (!window.confirm(confirmText)) return;

    setPending(accept ? "accept" : "reject");
    setError(null);
    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc("respond_to_quote", {
      p_token: token,
      p_accept: accept,
    });
    setPending(null);
    if (rpcError) {
      setError(rpcError.message || "No pudimos registrar tu respuesta.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        ¿Quieres avanzar con esta cotización?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending !== null} onClick={() => respond(true)}>
          <Check className="size-4" />
          {pending === "accept" ? "Enviando…" : "Aprobar cotización"}
        </Button>
        <Button
          variant="secondary"
          disabled={pending !== null}
          onClick={() => respond(false)}
        >
          <X className="size-4" />
          {pending === "reject" ? "Enviando…" : "Rechazar"}
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

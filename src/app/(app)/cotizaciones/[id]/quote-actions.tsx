"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightCircle,
  Check,
  Copy,
  MessageCircle,
  Send,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  convertQuoteToWorkOrder,
  deleteQuote,
  sendQuote,
  setQuoteStatus,
} from "../actions";
import type { QuoteStatus } from "../status";

interface QuoteActionsProps {
  quoteId: string;
  status: QuoteStatus;
  publicToken: string;
  hasWorkOrder: boolean;
}

export function QuoteActions({
  quoteId,
  status,
  publicToken,
  hasWorkOrder,
}: QuoteActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function publicUrl() {
    return `${window.location.origin}/cotizacion/${publicToken}`;
  }

  function run(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result?.error) setError(result.error);
      else router.refresh();
    });
  }

  async function copyLink() {
    await navigator.clipboard.writeText(publicUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    const text = encodeURIComponent(
      `Hola! Te comparto la cotización: ${publicUrl()}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  const shareControls = (status === "enviada" ||
    status === "aprobada" ||
    status === "rechazada" ||
    status === "vencida") && (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={copyLink}>
        {copied ? (
          <>
            <Check className="size-4 text-success" /> Copiado
          </>
        ) : (
          <>
            <Copy className="size-4" /> Copiar link
          </>
        )}
      </Button>
      <Button variant="secondary" size="sm" onClick={shareWhatsApp}>
        <MessageCircle className="size-4" /> WhatsApp
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {status === "borrador" && (
        <Button
          disabled={isPending}
          onClick={() => run(() => sendQuote(quoteId))}
        >
          <Send className="size-4" /> Enviar / generar link
        </Button>
      )}

      {shareControls}

      {(status === "enviada" || status === "vencida") && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => setQuoteStatus(quoteId, "aprobada"))}
          >
            Marcar aprobada
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => setQuoteStatus(quoteId, "rechazada"))}
          >
            Marcar rechazada
          </Button>
        </div>
      )}

      {status === "aprobada" && (
        <Button
          disabled={isPending}
          onClick={() => run(() => convertQuoteToWorkOrder(quoteId))}
        >
          <ArrowRightCircle className="size-4" />
          {hasWorkOrder ? "Ver orden de trabajo" : "Convertir en orden de trabajo"}
        </Button>
      )}

      {(status === "enviada" ||
        status === "aprobada" ||
        status === "rechazada" ||
        status === "vencida") &&
        !hasWorkOrder && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => run(() => setQuoteStatus(quoteId, "borrador"))}
          >
            <Undo2 className="size-4" /> Volver a borrador
          </Button>
        )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!hasWorkOrder && (
        <div className="border-t border-border pt-3">
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending}
            onClick={() => {
              if (!window.confirm("¿Eliminar esta cotización?")) return;
              run(() => deleteQuote(quoteId));
            }}
          >
            <Trash2 className="size-4" /> Eliminar
          </Button>
        </div>
      )}
    </div>
  );
}

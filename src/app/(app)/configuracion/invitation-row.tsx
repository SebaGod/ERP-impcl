"use client";

import { useState, useTransition } from "react";
import { Check, Copy, MessageCircle, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { revokeInvitation } from "./actions";

interface InvitationRowProps {
  id: string;
  token: string;
  email: string | null;
  role: string;
  expiresAt: string;
}

export function InvitationRow({
  id,
  token,
  email,
  role,
  expiresAt,
}: InvitationRowProps) {
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function inviteUrl() {
    return `${window.location.origin}/invitacion/${token}`;
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(inviteUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWhatsApp() {
    const text = encodeURIComponent(
      `Hola! Te invito a nuestro sistema de gestión. Entra aquí para crear tu cuenta: ${inviteUrl()}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {email || "Enlace abierto"}
        </p>
        <p className="text-xs text-muted-foreground">Vence el {expiresAt}</p>
      </div>
      <Badge variant="outline">{role}</Badge>
      <button
        onClick={handleCopy}
        title="Copiar enlace"
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
      >
        {copied ? (
          <>
            <Check className="size-3.5 text-success" /> Copiado
          </>
        ) : (
          <>
            <Copy className="size-3.5" /> Copiar enlace
          </>
        )}
      </button>
      <button
        onClick={handleWhatsApp}
        title="Compartir por WhatsApp"
        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
      >
        <MessageCircle className="size-3.5" /> WhatsApp
      </button>
      <button
        onClick={() => startTransition(() => revokeInvitation(id))}
        disabled={isPending}
        title="Revocar invitación"
        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

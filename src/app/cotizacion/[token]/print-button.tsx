"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted print:hidden"
    >
      <Printer className="size-4" /> Imprimir / Guardar PDF
    </button>
  );
}

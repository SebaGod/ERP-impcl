import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { resolvePeriod } from "../period";

/** Escapa un campo CSV (separador ; estilo Excel es-CL) */
function cell(value: string | number | null): string {
  const text = value === null ? "" : String(value);
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(cell).join(";"));
  // BOM para que Excel reconozca UTF-8 (acentos, signos)
  return "﻿" + lines.join("\r\n");
}

export async function GET(request: Request) {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") === "movimientos" ? "movimientos" : "ventas";
  const period = resolvePeriod(searchParams.get("periodo") ?? undefined);

  let csv: string;

  if (tipo === "movimientos") {
    const { data } = await supabase
      .from("transactions")
      .select("txn_date, type, amount, description, finance_categories (name)")
      .eq("org_id", session.org.id)
      .gte("txn_date", period.from)
      .lt("txn_date", period.toExclusive)
      .order("txn_date");

    csv = toCsv(
      ["Fecha", "Tipo", "Categoría", "Descripción", "Monto"],
      (data ?? []).map((t) => {
        const category = t.finance_categories as unknown as {
          name: string;
        } | null;
        return [
          formatDate(t.txn_date),
          t.type === "ingreso" ? "Ingreso" : "Egreso",
          category?.name ?? "",
          t.description ?? "",
          t.amount,
        ];
      })
    );
  } else {
    const { data } = await supabase
      .from("work_orders")
      .select(
        "code, title, amount_net, created_at, clients (name), work_order_stages (name)"
      )
      .eq("org_id", session.org.id)
      .gte("created_at", period.from)
      .lt("created_at", period.toExclusive)
      .order("created_at");

    csv = toCsv(
      ["Código", "Cliente", "Trabajo", "Etapa", "Monto neto", "Creada"],
      (data ?? []).map((w) => {
        const client = w.clients as unknown as { name: string } | null;
        const stage = w.work_order_stages as unknown as { name: string } | null;
        return [
          w.code,
          client?.name ?? "",
          w.title,
          stage?.name ?? "",
          w.amount_net,
          formatDate(w.created_at),
        ];
      })
    );
  }

  const filename = `${tipo}-${period.key}-${Date.now()}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

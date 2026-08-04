import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { exigirLectura } from "@/lib/lectura";
import { formatFecha } from "@/lib/locale";
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
  // El archivo lo lee el cliente: el periodo se corta y las fechas se
  // escriben en SU zona horaria, no en la nuestra.
  const region = session.org.region;
  const period = resolvePeriod(searchParams.get("periodo") ?? undefined, region);

  let csv: string;

  if (tipo === "movimientos") {
    const movimientosRes = await supabase
      .from("transactions")
      .select("txn_date, type, amount, description, finance_categories (name)")
      .eq("org_id", session.org.id)
      // txn_date es una columna `date`: se compara con el día tal cual,
      // sin zona horaria de por medio.
      .gte("txn_date", period.from)
      .lt("txn_date", period.toExclusive)
      .order("txn_date");

    // Un CSV con solo cabeceras se abre igual que uno legítimo: quien lo
    // recibe concluye que ese mes no hubo movimientos. Mejor no entregar
    // archivo que entregar uno que miente sin avisar.
    const data = exigirLectura(movimientosRes, "los movimientos del periodo");

    csv = toCsv(
      ["Fecha", "Tipo", "Categoría", "Descripción", "Monto"],
      (data ?? []).map((t) => {
        const category = t.finance_categories as unknown as {
          name: string;
        } | null;
        return [
          formatFecha(t.txn_date, region),
          t.type === "ingreso" ? "Ingreso" : "Egreso",
          category?.name ?? "",
          t.description ?? "",
          t.amount,
        ];
      })
    );
  } else {
    const ordenesRes = await supabase
      .from("work_orders")
      .select(
        "code, title, amount_net, created_at, clients:contacts (name), work_order_stages (name)"
      )
      .eq("org_id", session.org.id)
      // created_at es `timestamptz`: comparado con "aaaa-mm-dd" a secas,
      // Postgres lo lee en la zona del servidor y el mes arrancaría a las
      // 20:00 del día anterior en Chile. Van los instantes del cliente.
      .gte("created_at", period.fromInstant)
      .lt("created_at", period.toInstantExclusive)
      .order("created_at");

    const data = exigirLectura(ordenesRes, "las órdenes del periodo");

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
          formatFecha(w.created_at, region),
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

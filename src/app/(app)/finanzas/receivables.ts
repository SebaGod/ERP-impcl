import { createClient } from "@/lib/supabase/server";

export interface Receivable {
  workOrderId: string;
  code: string;
  title: string;
  clientName: string;
  paymentDueDate: string | null;
  expected: number;
  received: number;
  outstanding: number;
}

/**
 * Cuentas por cobrar: para cada OT con monto, lo esperado (amount_net)
 * menos lo ya recibido (transacciones de ingreso ligadas a esa OT).
 * Devuelve solo las que tienen saldo pendiente, de la más antigua a la
 * más nueva por fecha de pago.
 */
export async function getReceivables(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string
): Promise<Receivable[]> {
  const [{ data: workOrders }, { data: payments }] = await Promise.all([
    supabase
      .from("work_orders")
      .select("id, code, title, amount_net, payment_due_date, clients:contacts (name)")
      .eq("org_id", orgId)
      .gt("amount_net", 0),
    supabase
      .from("transactions")
      .select("work_order_id, amount")
      .eq("org_id", orgId)
      .eq("type", "ingreso")
      .not("work_order_id", "is", null),
  ]);

  const receivedByWo = new Map<string, number>();
  for (const payment of payments ?? []) {
    if (!payment.work_order_id) continue;
    receivedByWo.set(
      payment.work_order_id,
      (receivedByWo.get(payment.work_order_id) ?? 0) + payment.amount
    );
  }

  const receivables: Receivable[] = [];
  for (const wo of workOrders ?? []) {
    const received = receivedByWo.get(wo.id) ?? 0;
    const outstanding = wo.amount_net - received;
    if (outstanding <= 0) continue;
    const client = wo.clients as unknown as { name: string } | null;
    receivables.push({
      workOrderId: wo.id,
      code: wo.code,
      title: wo.title,
      clientName: client?.name ?? "—",
      paymentDueDate: wo.payment_due_date,
      expected: wo.amount_net,
      received,
      outstanding,
    });
  }

  receivables.sort((a, b) => {
    const da = a.paymentDueDate ?? "9999-12-31";
    const db = b.paymentDueDate ?? "9999-12-31";
    return da.localeCompare(db);
  });

  return receivables;
}

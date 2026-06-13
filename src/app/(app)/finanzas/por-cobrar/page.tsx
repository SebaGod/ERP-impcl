import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Receipt } from "lucide-react";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatCLP, formatDate, todayISO } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { getReceivables } from "../receivables";
import { PaymentForm } from "./payment-form";

export const metadata: Metadata = { title: "Cuentas por cobrar" };

export default async function PorCobrarPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const today = todayISO();
  const receivables = await getReceivables(supabase, session.org.id);
  const total = receivables.reduce((s, r) => s + r.outstanding, 0);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/finanzas"
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Finanzas
      </Link>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold">Cuentas por cobrar</h1>
        {receivables.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Total pendiente:{" "}
            <span className="font-semibold text-foreground">
              {formatCLP(total)}
            </span>
          </p>
        )}
      </div>

      {receivables.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Estás al día"
          description="No hay trabajos con saldo pendiente de cobro. Cuando registres una OT con monto y aún no recibas el pago completo, aparecerá aquí."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {receivables.map((r) => {
            const overdue = r.paymentDueDate !== null && r.paymentDueDate < today;
            return (
              <Card key={r.workOrderId}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/tablero/${r.workOrderId}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {r.code}
                      </Link>
                      <span className="truncate text-sm text-muted-foreground">
                        {r.clientName}
                      </span>
                      {overdue && <Badge variant="destructive">Vencida</Badge>}
                    </div>
                    <p className="mt-0.5 truncate text-sm">{r.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Total {formatCLP(r.expected)} · abonado{" "}
                      {formatCLP(r.received)} ·{" "}
                      <span className="font-medium text-foreground">
                        pendiente {formatCLP(r.outstanding)}
                      </span>
                      {r.paymentDueDate &&
                        ` · vence ${formatDate(r.paymentDueDate)}`}
                    </p>
                  </div>
                  <div className="sm:w-80 sm:shrink-0">
                    <PaymentForm
                      workOrderId={r.workOrderId}
                      outstanding={r.outstanding}
                      today={today}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

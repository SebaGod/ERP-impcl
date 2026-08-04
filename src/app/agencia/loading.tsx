import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto del panel de agencia.
 *
 * El panel abre con cuatro RPC en paralelo sobre toda la cartera, que es
 * la consulta más pesada de la aplicación. Sin esto, el navegador se
 * quedaba con la pantalla anterior puesta y sin ninguna señal: se ve
 * igual que un clic que no registró, y la reacción natural es volver a
 * hacer clic.
 *
 * Dibuja la forma que va a llegar —indicadores arriba, gráfico, lista de
 * subcuentas— y no un spinner al centro: así el contenido aparece donde
 * ya estaba mirando el ojo, sin que la página salte.
 */
export default function CargandoAgencia() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-10 w-40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>

      <div className="flex flex-col gap-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    </div>
  );
}

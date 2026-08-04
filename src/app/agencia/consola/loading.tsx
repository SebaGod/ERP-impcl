import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto de la consola.
 *
 * Va debajo de las pestañas —que son un componente de cliente y no se
 * vuelven a montar—, así que al cambiar de pestaña la navegación queda
 * fija y solo parpadea el contenido. Es el detalle que separa "cambié de
 * pestaña" de "se recargó la página".
 *
 * Las cuatro secciones (agentes, consumo, errores, límites) son listas
 * largas con filtros arriba, y esa es la forma que se dibuja.
 */
export default function CargandoConsola() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-9 w-28" />
      </div>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    </div>
  );
}

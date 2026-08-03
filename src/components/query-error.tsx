import { TriangleAlert } from "lucide-react";

/**
 * Aviso de consulta caída.
 *
 * Una consulta que falla y se dibuja como lista vacía es peor que un error
 * a la vista: la pantalla se ve sana y quien la mira concluye que no tiene
 * datos. Ya nos pasó una vez —una relación rota devolvió cero filas sin
 * error y las pantallas siguieron respondiendo 200— y no se detectó
 * mirando la pantalla. Por eso las dos situaciones se separan siempre.
 *
 * No muestra el mensaje crudo del motor: ahí viajan nombres de tablas y
 * restricciones que no le sirven a quien está del otro lado.
 */
export function QueryError({ partes }: { partes: string[] }) {
  if (partes.length === 0) return null;

  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;

  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl border border-destructive/40 bg-destructive/5 p-4"
    >
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-destructive">
          No pudimos cargar {lista}
        </p>
        <p className="text-sm text-muted-foreground">
          Lo que ves abajo está incompleto: los números que dependen de esa
          consulta aparecen en cero aunque no lo estén. Vuelve a cargar la
          página; si sigue igual, avísanos con la hora exacta.
        </p>
      </div>
    </div>
  );
}

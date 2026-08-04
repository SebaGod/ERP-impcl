import { formatMonto, type ConfigRegional } from "@/lib/locale";

/**
 * El detalle de la cotización, tal como lo lee el cliente.
 *
 * Vive aparte de la página porque es lo único de este documento que
 * cambia de forma según el ancho de la pantalla, y separarlo permite
 * montarlo con datos de prueba para medirlo de verdad en un teléfono en
 * vez de confiar en que las clases hagan lo que uno cree.
 */

export interface ItemCotizacion {
  description: string;
  quantity: number;
  unit_price_net: number;
  line_total: number;
}

export function ItemsCotizacion({
  items,
  region,
}: {
  items: ItemCotizacion[];
  region: ConfigRegional;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="py-2 font-medium">Descripción</th>
          {/* Cuatro columnas no caben en un teléfono: descontando el
              margen de la hoja quedan unos 340px, y la descripción se
              parte en una palabra por línea. Esta página es la que más se
              abre desde el celular —llega por WhatsApp y el cliente la
              mira ahí mismo—, así que en pantalla chica la cantidad y el
              precio unitario bajan a una línea debajo del nombre y arriba
              queda solo el subtotal, que es lo que se busca al leer una
              cotización. */}
          <th className="hidden py-2 text-right font-medium sm:table-cell">
            Cant.
          </th>
          <th className="hidden py-2 text-right font-medium sm:table-cell">
            P. unit.
          </th>
          <th className="py-2 text-right font-medium">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={index} className="border-b border-border">
            <td className="py-2.5 pr-2">
              {item.description}
              <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground sm:hidden">
                {item.quantity} × {formatMonto(item.unit_price_net, region)}
              </span>
            </td>
            <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">
              {item.quantity}
            </td>
            <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">
              {formatMonto(item.unit_price_net, region)}
            </td>
            <td className="py-2.5 text-right font-medium tabular-nums">
              {formatMonto(item.line_total, region)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

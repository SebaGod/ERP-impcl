import { redirect } from "next/navigation";

/**
 * Redirección de una URL vieja.
 *
 * Los reportes se fundieron con el dashboard, pero la dirección siguió
 * viviendo en enlaces guardados, así que se mantiene en vez de dejarla
 * caer en un 404.
 *
 * El segmento no sobrevive solo por eso: debajo está `/reportes/export`,
 * que arma los CSV de órdenes y de movimientos del periodo. Esa es la
 * razón de que esta carpeta tenga una página que no dibuja nada y aun
 * así no se pueda borrar. Los enlaces a la exportación viven en Tablero
 * y en Finanzas, que son las pantallas de donde salen esos datos: al
 * fundir los reportes con el dashboard se perdieron, y la exportación
 * quedó funcionando pero sin forma de llegar a ella.
 */
export default function Page() {
  redirect("/dashboard");
}

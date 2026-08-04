/**
 * "No existe" y "no se pudo leer" no son lo mismo.
 *
 * Las doce pantallas de detalle hacían todas lo mismo:
 *
 *     const { data: doc } = await supabase...maybeSingle();
 *     if (!doc) notFound();
 *
 * Al desestructurar solo `data` se pierde `error`, así que una consulta
 * caída y un registro inexistente llegan al `if` exactamente iguales:
 * ambos son null. La pantalla entonces afirma que el registro no existe,
 * que es una afirmación distinta de "no lo pude leer" y lleva a
 * decisiones distintas.
 *
 * En la mayoría de las pantallas eso es molesto. En /documentos/[id] es
 * caro: alguien abre una factura, el motor tarda un instante de más, la
 * pantalla le dice que no existe, y la emite de nuevo. Deshacer una
 * factura duplicada requiere emitir una nota de crédito y explicársela
 * al cliente y al SII. La causa habría sido un hipo de un segundo.
 *
 * Lanzar es la respuesta correcta cuando falla la lectura: sube al error
 * boundary, que muestra el botón de reintentar —y reintentar es
 * precisamente lo que arregla un fallo transitorio— y además deja la
 * caída anotada en la bitácora. Un notFound(), en cambio, no se registra
 * en ninguna parte: para el sistema es una respuesta normal.
 */

/** Cualquier resultado de Supabase: lo único que importa es la forma */
interface ResultadoLectura<T> {
  data: T | null;
  error: { message: string } | null;
}

/**
 * Devuelve el dato, o null si de verdad no está. Lanza si no se pudo
 * leer.
 *
 * @param que Cómo nombrar lo que se buscaba, para el log del servidor.
 *   No llega al navegador: en producción Next reemplaza el mensaje por
 *   uno genérico antes de mandarlo.
 */
export function exigirLectura<T>(
  resultado: ResultadoLectura<T>,
  que: string
): T | null {
  if (resultado.error) {
    throw new Error(`No se pudo leer ${que}: ${resultado.error.message}`);
  }
  return resultado.data;
}

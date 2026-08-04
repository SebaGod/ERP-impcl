import type { SupabaseClient } from "@supabase/supabase-js";
import { brutoDesdeNeto, TASA_IVA, type LineaDte } from "@/lib/dte/montos";
import { tipoDte, type CodigoDte } from "@/lib/dte/tipos";
import type { ContactoElegible } from "@/components/contact-picker-actions";

/**
 * De dónde sale un documento: una cotización aprobada o una orden de
 * trabajo terminada.
 *
 * Acá vive la conversión que se hace mal en silencio: cotizaciones y
 * órdenes guardan precios NETOS, y una boleta los quiere CON IVA
 * INCLUIDO. Copiarlos tal cual haría que el cliente pagara el neto y el
 * negocio pusiera el IVA de su bolsillo —$1.900 por cada $10.000, en
 * cada boleta, sin que nada falle a la vista—.
 *
 * Por eso la conversión depende del tipo de documento y no del origen, y
 * por eso devuelve un aviso cuando tuvo que convertir: el usuario ve un
 * precio distinto del que cotizó y tiene derecho a saber por qué.
 */

export interface OrigenDocumento {
  /** Para el input oculto que guarda el vínculo */
  campo: "quote_id" | "work_order_id";
  id: string;
  /** "Cotización COT-0012" */
  etiqueta: string;
  /** A dónde volver si se arrepiente */
  href: string;
  lineas: LineaDte[];
  contacto: ContactoElegible | null;
  /** Los precios venían netos y el tipo elegido los quiere con IVA */
  seConvirtioAIva: boolean;
  /** Lo que sumaban los netos del origen, para poder contrastarlo */
  netoOrigen: number;
}

interface FilaCotizacion {
  id: string;
  code: string;
  status: string;
  client_id: string | null;
  net_total: number;
  tax_rate: number | null;
}

interface FilaItem {
  description: string;
  quantity: number;
  unit_price_net: number;
}

/**
 * Convierte precios netos a la base que espera el tipo de documento.
 *
 * En una boleta el precio con IVA se calcula POR LÍNEA y no sobre el
 * total: es el precio que se imprime al lado de cada ítem, y tiene que
 * ser un número redondo de pesos por sí mismo. Los totales del documento
 * los recalcula calcularDte a partir de estos precios, así que el neto
 * final puede diferir en algún peso del neto cotizado. Es inevitable en
 * pesos enteros, y manda lo que el cliente paga.
 */
function convertirPrecios(
  lineas: LineaDte[],
  codigo: CodigoDte,
  tasa: number
): { lineas: LineaDte[]; convertido: boolean } {
  const tipo = tipoDte(codigo);
  // Solo hay que convertir si el documento cobra con IVA incluido Y es
  // afecto. Una boleta exenta no lleva IVA que agregar.
  if (!tipo.preciosConIva || !tipo.afecto) {
    return { lineas, convertido: false };
  }
  return {
    lineas: lineas.map((l) => ({
      ...l,
      precioUnitario: brutoDesdeNeto(l.precioUnitario, tasa),
    })),
    convertido: true,
  };
}

async function contactoDe(
  supabase: SupabaseClient,
  orgId: string,
  contactId: string | null
): Promise<ContactoElegible | null> {
  if (!contactId) return null;
  const { data } = await supabase
    .from("contacts")
    .select("id, name, phone, email")
    .eq("id", contactId)
    .eq("org_id", orgId)
    .maybeSingle<ContactoElegible>();
  return data ?? null;
}

/** La cotización, si existe, es de esta organización y se puede facturar */
export async function origenCotizacion(
  supabase: SupabaseClient,
  orgId: string,
  quoteId: string,
  codigo: CodigoDte
): Promise<OrigenDocumento | null> {
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, code, status, client_id, net_total, tax_rate")
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .maybeSingle<FilaCotizacion>();
  if (!quote) return null;

  const { data: items } = await supabase
    .from("quote_items")
    .select("description, quantity, unit_price_net")
    .eq("quote_id", quoteId)
    .order("position")
    .limit(500)
    .returns<FilaItem[]>();

  const netas: LineaDte[] = (items ?? []).map((i) => ({
    descripcion: i.description,
    cantidad: Number(i.quantity) || 1,
    precioUnitario: Number(i.unit_price_net) || 0,
  }));

  // La tasa que se cotizó, no la vigente: si el IVA cambió entre medio,
  // el cliente aceptó un precio calculado con la anterior.
  const tasa = Number(quote.tax_rate ?? TASA_IVA) || TASA_IVA;
  const { lineas, convertido } = convertirPrecios(netas, codigo, tasa);

  return {
    campo: "quote_id",
    id: quote.id,
    etiqueta: `Cotización ${quote.code}`,
    href: `/cotizaciones/${quote.id}`,
    lineas,
    contacto: await contactoDe(supabase, orgId, quote.client_id),
    seConvirtioAIva: convertido,
    netoOrigen: Number(quote.net_total) || 0,
  };
}

interface FilaOrden {
  id: string;
  code: string;
  title: string;
  client_id: string | null;
  amount_net: number;
  tax_rate: number | null;
}

/**
 * La orden de trabajo, que no tiene detalle: es un solo monto.
 *
 * Se convierte en una única línea con el título del trabajo. No se
 * inventa un desglose que la orden no tiene: el usuario puede agregar
 * líneas si quiere, pero lo que se le presenta es lo que hay.
 */
export async function origenOrden(
  supabase: SupabaseClient,
  orgId: string,
  workOrderId: string,
  codigo: CodigoDte
): Promise<OrigenDocumento | null> {
  const { data: orden } = await supabase
    .from("work_orders")
    .select("id, code, title, client_id, amount_net, tax_rate")
    .eq("id", workOrderId)
    .eq("org_id", orgId)
    .maybeSingle<FilaOrden>();
  if (!orden) return null;

  const neto = Number(orden.amount_net) || 0;
  const tasa = Number(orden.tax_rate ?? TASA_IVA) || TASA_IVA;
  const { lineas, convertido } = convertirPrecios(
    [{ descripcion: orden.title, cantidad: 1, precioUnitario: neto }],
    codigo,
    tasa
  );

  return {
    campo: "work_order_id",
    id: orden.id,
    etiqueta: `Orden ${orden.code}`,
    href: `/tablero/${orden.id}`,
    lineas,
    contacto: await contactoDe(supabase, orgId, orden.client_id),
    seConvirtioAIva: convertido,
    netoOrigen: neto,
  };
}

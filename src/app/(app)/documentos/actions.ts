"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hoyISO } from "@/lib/locale";
import { calcularDte, montosParaAnular, type LineaDte } from "@/lib/dte/montos";
import { esCodigoDte, tipoDte, type CodigoDte } from "@/lib/dte/tipos";

export interface EstadoAccion {
  error: string | null;
  ok?: boolean;
}

/**
 * Registro de documentos tributarios.
 *
 * La plataforma NO emite: el cliente emite en el portal del SII, con su
 * contador o en otro sistema, y acá queda registrado con su folio. Por eso
 * el folio se escribe a mano y no se genera.
 *
 * Todo lo que toca montos pasa por calcularDte(): que la pantalla y la
 * base calculen distinto sería tener dos verdades sobre la misma boleta.
 */

/** El precio se escribe como "1.250.000"; los puntos son de miles, no decimales */
function aPesos(valor: FormDataEntryValue | null): number {
  const limpio = String(valor ?? "").replace(/[^\d-]/g, "");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : 0;
}

function aCantidad(valor: FormDataEntryValue | null): number {
  // Acá sí puede haber decimales (2,5 kg), y en Chile se escriben con coma
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

/** Las líneas vienen como campos repetidos del formulario */
function leerLineas(formData: FormData): LineaDte[] {
  const descripciones = formData.getAll("linea_descripcion");
  const cantidades = formData.getAll("linea_cantidad");
  const precios = formData.getAll("linea_precio");
  const exentas = formData.getAll("linea_exenta");

  const lineas: LineaDte[] = [];
  for (let i = 0; i < descripciones.length; i++) {
    const descripcion = String(descripciones[i] ?? "").trim();
    const cantidad = aCantidad(cantidades[i] ?? null);
    const precioUnitario = aPesos(precios[i] ?? null);
    // Una fila en blanco no es un error: es la fila vacía que el
    // formulario deja al final para seguir escribiendo.
    if (!descripcion && cantidad === 0 && precioUnitario === 0) continue;
    if (!descripcion) continue;

    lineas.push({
      descripcion,
      cantidad: cantidad || 1,
      precioUnitario,
      exenta: String(exentas[i] ?? "") === "si",
    });
  }
  return lineas;
}

async function guardarLineas(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  dteId: string,
  codigo: CodigoDte,
  lineas: LineaDte[]
) {
  const { lineas: calculadas, montos } = calcularDte(codigo, lineas);

  await supabase.from("dte_items").delete().eq("dte_id", dteId);
  if (calculadas.length > 0) {
    await supabase.from("dte_items").insert(
      calculadas.map((l, i) => ({
        org_id: orgId,
        dte_id: dteId,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitario,
        descuento: l.descuento ?? 0,
        exenta: Boolean(l.exenta),
        monto: l.totalLinea,
        position: i,
      }))
    );
  }

  await supabase
    .from("dte_documents")
    .update({
      neto: montos.neto,
      exento: montos.exento,
      iva: montos.iva,
      total: montos.total,
    })
    .eq("id", dteId)
    .eq("org_id", orgId);

  return montos;
}

/** Crea el documento y deja el detalle listo para revisar antes de darlo por emitido */
export async function crearDocumento(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const region = session.org.region;

  const codigo = Number(formData.get("tipo"));
  if (!esCodigoDte(codigo)) return { error: "Elige el tipo de documento" };
  const tipo = tipoDte(codigo);

  const contactId = String(formData.get("contact_id") ?? "").trim() || null;
  if (tipo.exigeReceptor && !contactId) {
    return {
      error: `Una ${tipo.corto.toLowerCase()} necesita un cliente identificado`,
    };
  }

  const lineas = leerLineas(formData);
  if (lineas.length === 0) {
    return { error: "Agrega al menos un detalle al documento" };
  }

  // El día del negocio, no el del servidor: una boleta hecha a las 22:00
  // es del día que el negocio está cerrando, no del siguiente en UTC.
  const fecha = String(formData.get("fecha_emision") ?? "").trim() || hoyISO(region);

  // Los datos del receptor se COPIAN: el documento tiene que seguir
  // diciendo lo que se declaró aunque el cliente se cambie de dirección.
  let receptor: Record<string, string | null> = {};
  if (contactId) {
    const { data: contacto } = await supabase
      .from("contacts")
      .select("name, razon_social, rut, giro, address, comuna")
      .eq("id", contactId)
      .eq("org_id", session.org.id)
      .maybeSingle();
    if (!contacto) return { error: "No encontramos ese cliente" };

    receptor = {
      receptor_rut: contacto.rut,
      receptor_razon_social: contacto.razon_social || contacto.name,
      receptor_giro: contacto.giro,
      receptor_direccion: contacto.address,
      receptor_comuna: contacto.comuna,
    };
  }

  const { montos } = calcularDte(codigo, lineas);

  const { data: creado, error } = await supabase
    .from("dte_documents")
    .insert({
      org_id: session.org.id,
      tipo: codigo,
      estado: "borrador",
      fecha_emision: fecha,
      contact_id: contactId,
      ...receptor,
      neto: montos.neto,
      exento: montos.exento,
      iva: montos.iva,
      total: montos.total,
      observaciones: String(formData.get("observaciones") ?? "").trim() || null,
      quote_id: String(formData.get("quote_id") ?? "").trim() || null,
      work_order_id: String(formData.get("work_order_id") ?? "").trim() || null,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !creado) {
    return { error: "No pudimos crear el documento." };
  }

  await guardarLineas(supabase, session.org.id, creado.id, codigo, lineas);

  revalidatePath("/documentos");
  redirect(`/documentos/${creado.id}`);
}

/** Reemplaza el detalle de un borrador */
export async function actualizarDocumento(
  dteId: string,
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: doc } = await supabase
    .from("dte_documents")
    .select("tipo, estado")
    .eq("id", dteId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!doc) return { error: "Documento no encontrado" };

  // La base también lo impide con un trigger; acá se explica en vez de
  // dejar que reviente con el mensaje de Postgres.
  if (doc.estado !== "borrador") {
    return {
      error:
        "Este documento ya está emitido. Para corregirlo hay que hacer una nota de crédito.",
    };
  }

  const codigo = doc.tipo as CodigoDte;
  const lineas = leerLineas(formData);
  if (lineas.length === 0) {
    return { error: "El documento tiene que tener al menos un detalle" };
  }

  await guardarLineas(supabase, session.org.id, dteId, codigo, lineas);

  revalidatePath(`/documentos/${dteId}`);
  return { error: null, ok: true };
}

/**
 * Marca el documento como emitido, con el folio que le dio el SII.
 *
 * A partir de acá no se edita: es un documento tributario real y su
 * corrección es una nota de crédito.
 */
export async function registrarEmision(
  dteId: string,
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const folio = Number(String(formData.get("folio") ?? "").replace(/\D/g, ""));
  if (!Number.isInteger(folio) || folio <= 0) {
    return { error: "Escribe el folio que le asignó el SII" };
  }

  const { data: doc } = await supabase
    .from("dte_documents")
    .select("estado, total, tipo, ref_tipo, ref_folio, ref_codigo")
    .eq("id", dteId)
    .eq("org_id", session.org.id)
    .maybeSingle();
  if (!doc) return { error: "Documento no encontrado" };
  if (doc.estado !== "borrador") {
    return { error: "Este documento ya estaba registrado como emitido." };
  }
  if (Number(doc.total) <= 0) {
    return { error: "Un documento en cero no se puede registrar." };
  }

  const { error } = await supabase
    .from("dte_documents")
    .update({ folio, estado: "emitido" })
    .eq("id", dteId)
    .eq("org_id", session.org.id);

  if (error) {
    // 23505: ese folio ya está usado en este tipo. Es el error que
    // protege el correlativo, y hay que decirlo con nombre y apellido.
    if (error.code === "23505") {
      return {
        error: `El folio ${folio} ya está registrado en otro documento de este tipo. Revisa el número.`,
      };
    }
    return { error: "No pudimos registrar la emisión." };
  }

  // Recién ahora el original queda anulado: mientras la nota era un
  // borrador, el documento que corrige seguía vigente. Anularlo antes
  // habría dejado una factura muerta por una nota que quizá nunca salía.
  if (doc.tipo === 61 && doc.ref_codigo === 1 && doc.ref_tipo && doc.ref_folio) {
    const { error: errorAnular } = await supabase
      .from("dte_documents")
      .update({ estado: "anulado" })
      .eq("org_id", session.org.id)
      .eq("tipo", doc.ref_tipo)
      .eq("folio", doc.ref_folio)
      .neq("estado", "borrador");

    if (errorAnular) {
      // La nota SÍ quedó emitida y eso es lo que importa ante el SII; el
      // estado del original es nuestro y se puede corregir. Se avisa en
      // vez de dejarlo pasar en silencio.
      return {
        error: `La nota quedó registrada con folio ${folio}, pero no pudimos marcar el documento original como anulado. Revísalo.`,
      };
    }
    revalidatePath(`/documentos`);
  }

  revalidatePath("/documentos");
  revalidatePath(`/documentos/${dteId}`);
  return { error: null, ok: true };
}

/**
 * Crea la nota de crédito que anula un documento.
 *
 * Los montos se COPIAN del original en vez de recalcularse: si la tasa de
 * IVA cambió entre medio, recalcular dejaría una nota que no anula del
 * todo y la diferencia queda dando vueltas en la contabilidad para siempre.
 */
export async function anularConNotaCredito(
  dteId: string,
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const session = await requireAdminContext();
  const supabase = await createClient();
  const region = session.org.region;

  const motivo = String(formData.get("razon") ?? "").trim();
  if (motivo.length < 3) {
    return { error: "Escribe por qué se anula: queda en el documento" };
  }

  const { data: original } = await supabase
    .from("dte_documents")
    .select(
      "id, tipo, folio, estado, fecha_emision, contact_id, receptor_rut, receptor_razon_social, receptor_giro, receptor_direccion, receptor_comuna, neto, exento, iva, total, tasa_iva"
    )
    .eq("id", dteId)
    .eq("org_id", session.org.id)
    .maybeSingle();

  if (!original) return { error: "Documento no encontrado" };
  if (original.estado === "borrador") {
    return {
      error:
        "Este documento es un borrador: se elimina directamente, no necesita nota de crédito.",
    };
  }
  if (original.estado === "anulado") {
    return { error: "Este documento ya está anulado." };
  }
  if (!original.folio) {
    return { error: "El documento no tiene folio: no se puede referenciar." };
  }

  const montos = montosParaAnular({
    neto: Number(original.neto),
    exento: Number(original.exento),
    iva: Number(original.iva),
    total: Number(original.total),
  });

  const { data: nota, error } = await supabase
    .from("dte_documents")
    .insert({
      org_id: session.org.id,
      tipo: 61,
      estado: "borrador",
      fecha_emision: hoyISO(region),
      contact_id: original.contact_id,
      receptor_rut: original.receptor_rut,
      receptor_razon_social: original.receptor_razon_social,
      receptor_giro: original.receptor_giro,
      receptor_direccion: original.receptor_direccion,
      receptor_comuna: original.receptor_comuna,
      neto: montos.neto,
      exento: montos.exento,
      iva: montos.iva,
      total: montos.total,
      tasa_iva: original.tasa_iva,
      ref_tipo: original.tipo,
      ref_folio: original.folio,
      ref_fecha: original.fecha_emision,
      // 1 = anula el documento completo
      ref_codigo: 1,
      ref_razon: motivo,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !nota) return { error: "No pudimos crear la nota de crédito." };

  await supabase.from("dte_items").insert({
    org_id: session.org.id,
    dte_id: nota.id,
    descripcion: `Anula ${tipoDte(original.tipo as CodigoDte).corto.toLowerCase()} folio ${original.folio}`,
    cantidad: 1,
    precio_unitario: montos.total,
    monto: montos.total,
    position: 0,
  });

  // El original queda anulado recién cuando la nota se emite de verdad;
  // hasta entonces es un borrador y anular acá sería adelantarse a un
  // documento que todavía puede no salir.
  revalidatePath("/documentos");
  redirect(`/documentos/${nota.id}`);
}

/** Solo un borrador se elimina; lo emitido se anula */
export async function eliminarBorrador(dteId: string): Promise<EstadoAccion> {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { error } = await supabase
    .from("dte_documents")
    .delete()
    .eq("id", dteId)
    .eq("org_id", session.org.id)
    .eq("estado", "borrador");

  if (error) {
    return {
      error:
        "No se pudo eliminar. Si el documento ya está emitido, hay que anularlo con una nota de crédito.",
    };
  }

  revalidatePath("/documentos");
  redirect("/documentos");
}

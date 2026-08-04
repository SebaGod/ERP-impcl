import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Consultas paginadas del CRM.
 *
 * Son la ÚNICA puerta de las vistas hacia contactos, oportunidades y
 * conversaciones. Cada función envuelve una RPC que pagina, filtra y
 * cuenta en Postgres; nada de aquí trae una tabla completa. Si una vista
 * necesita un dato nuevo, se agrega a la RPC, no se vuelve al select
 * directo: PostgREST corta en 1.000 filas por respuesta sin avisar, y esa
 * mentira silenciosa es justo lo que esta capa elimina.
 *
 * Todas reciben el client de la sesión: la autorización vive en la RPC
 * (app.is_member una vez), y a quien no pertenece a la organización le
 * devuelven vacío.
 */

/** Filtros del tablero. El conteo y las tarjetas usan EXACTAMENTE estos. */
export interface FiltrosBoard {
  q?: string | null;
  /** uuid del vendedor, o null para todos */
  owner?: string | null;
  /** true = solo oportunidades sin asignar (gana sobre `owner`) */
  sinOwner?: boolean;
  canal?: string | null;
  tags?: string[] | null;
  /** ISO: solo lo creado desde esta fecha */
  desde?: string | null;
}

export interface ColumnaBoard {
  stage_id: string;
  /** Total REAL de la etapa con los filtros puestos, no lo cargado */
  total: number;
  valor: number;
}

export interface TarjetaBoard {
  id: string;
  title: string;
  value: number;
  created_at: string;
  contact_id: string;
  contact_name: string;
  contact_source: string | null;
  contact_tags: string[];
  owner_id: string | null;
  owner_name: string | null;
}

/** Cursor keyset de una columna: la última tarjeta ya cargada */
export interface CursorBoard {
  creada: string;
  id: string;
}

export interface PaginaTarjetas {
  tarjetas: TarjetaBoard[];
  /** Cursor para pedir la página siguiente, o null si no hay más */
  siguiente: CursorBoard | null;
}

function filtrosBoardRpc(orgId: string, pipelineId: string, f: FiltrosBoard) {
  return {
    p_org: orgId,
    p_pipeline: pipelineId,
    p_q: f.q?.trim() || null,
    p_owner: f.sinOwner ? null : (f.owner ?? null),
    p_sin_owner: Boolean(f.sinOwner),
    p_canal: f.canal ?? null,
    p_tags: f.tags && f.tags.length > 0 ? f.tags : null,
    p_desde: f.desde ?? null,
  };
}

/** Total y valor por etapa, respetando los filtros */
export async function columnasBoard(
  supabase: SupabaseClient,
  orgId: string,
  pipelineId: string,
  filtros: FiltrosBoard = {}
): Promise<ColumnaBoard[]> {
  const { data, error } = await supabase.rpc(
    "crm_board_columns",
    filtrosBoardRpc(orgId, pipelineId, filtros)
  );
  if (error) throw new Error(`No se pudo contar el tablero: ${error.message}`);
  return ((data as ColumnaBoard[] | null) ?? []).map((c) => ({
    stage_id: c.stage_id,
    total: Number(c.total),
    valor: Number(c.valor),
  }));
}

/** Una página de tarjetas de UNA columna */
export async function tarjetasBoard(
  supabase: SupabaseClient,
  orgId: string,
  pipelineId: string,
  stageId: string,
  filtros: FiltrosBoard = {},
  cursor: CursorBoard | null = null,
  limite = 25
): Promise<PaginaTarjetas> {
  // Se pide una de más: si llega, hay página siguiente y no se muestra.
  const { data, error } = await supabase.rpc("crm_board_cards", {
    ...filtrosBoardRpc(orgId, pipelineId, filtros),
    p_stage: stageId,
    p_cursor_creada: cursor?.creada ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limite + 1,
  });
  if (error) throw new Error(`No se pudo leer la columna: ${error.message}`);

  const filas = ((data as TarjetaBoard[] | null) ?? []).map((t) => ({
    ...t,
    value: Number(t.value),
    contact_tags: t.contact_tags ?? [],
  }));
  const hayMas = filas.length > limite;
  const tarjetas = hayMas ? filas.slice(0, limite) : filas;
  const ultima = tarjetas[tarjetas.length - 1];

  return {
    tarjetas,
    siguiente:
      hayMas && ultima ? { creada: ultima.created_at, id: ultima.id } : null,
  };
}

/** Canales presentes en el embudo, para poblar el filtro */
export async function canalesBoard(
  supabase: SupabaseClient,
  orgId: string,
  pipelineId: string
): Promise<string[]> {
  const { data, error } = await supabase.rpc("crm_board_canales", {
    p_org: orgId,
    p_pipeline: pipelineId,
  });
  if (error) return [];
  return ((data as { canal: string }[] | null) ?? []).map((c) => c.canal);
}

// -------------------------------------------------------------
// Contactos
// -------------------------------------------------------------

export type OrdenContactos = "reciente" | "nombre" | "score";

export interface FiltrosContactos {
  q?: string | null;
  lifecycle?: string | null;
  source?: string | null;
  tags?: string[] | null;
  /** clave del campo personalizado → valor buscado (parcial) */
  campos?: Record<string, string> | null;
  desde?: string | null;
  orden?: OrdenContactos;
  dir?: "asc" | "desc";
}

export interface FilaContacto {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  lifecycle: string;
  score: number;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
}

export interface PaginaContactos {
  contactos: FilaContacto[];
  /** Total de la consulta filtrada (no solo la página) */
  total: number;
}

export async function paginaContactos(
  supabase: SupabaseClient,
  orgId: string,
  filtros: FiltrosContactos = {},
  limite = 50,
  offset = 0
): Promise<PaginaContactos> {
  const campos =
    filtros.campos && Object.keys(filtros.campos).length > 0
      ? filtros.campos
      : null;

  const { data, error } = await supabase.rpc("crm_contacts_page", {
    p_org: orgId,
    p_q: filtros.q?.trim() || null,
    p_lifecycle: filtros.lifecycle ?? null,
    p_source: filtros.source ?? null,
    p_tags: filtros.tags && filtros.tags.length > 0 ? filtros.tags : null,
    p_campos: campos,
    p_desde: filtros.desde ?? null,
    p_orden: filtros.orden ?? "reciente",
    p_dir: filtros.dir ?? "desc",
    p_limit: limite,
    p_offset: offset,
  });
  if (error) throw new Error(`No se pudo leer los contactos: ${error.message}`);

  const filas = (data as (FilaContacto & { total: number })[] | null) ?? [];
  return {
    contactos: filas.map(({ total: _total, ...c }) => ({
      ...c,
      tags: c.tags ?? [],
      custom_fields: c.custom_fields ?? {},
    })),
    total: filas.length > 0 ? Number(filas[0]!.total) : 0,
  };
}

// -------------------------------------------------------------
// Bandeja
// -------------------------------------------------------------

export type EstadoInbox = "abiertas" | "cerradas" | "todas";

export interface FiltrosInbox {
  estado?: EstadoInbox;
  canal?: string | null;
  q?: string | null;
}

export interface ConversacionInbox {
  id: string;
  channel: string;
  status: string;
  ai_enabled: boolean;
  last_message_at: string | null;
  contact_id: string;
  contact_name: string;
  ultimo_body: string | null;
  ultimo_sender: string | null;
  ultimo_at: string | null;
}

export interface CursorInbox {
  at: string;
  id: string;
}

export interface PaginaInbox {
  conversaciones: ConversacionInbox[];
  siguiente: CursorInbox | null;
}

export async function paginaInbox(
  supabase: SupabaseClient,
  orgId: string,
  filtros: FiltrosInbox = {},
  cursor: CursorInbox | null = null,
  limite = 30
): Promise<PaginaInbox> {
  const { data, error } = await supabase.rpc("crm_inbox_page", {
    p_org: orgId,
    p_estado: filtros.estado ?? "abiertas",
    p_canal: filtros.canal ?? null,
    p_q: filtros.q?.trim() || null,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limite + 1,
  });
  if (error) throw new Error(`No se pudo leer la bandeja: ${error.message}`);

  const filas = (data as ConversacionInbox[] | null) ?? [];
  const hayMas = filas.length > limite;
  const conversaciones = hayMas ? filas.slice(0, limite) : filas;
  const ultima = conversaciones[conversaciones.length - 1];

  return {
    conversaciones,
    siguiente:
      hayMas && ultima?.last_message_at
        ? { at: ultima.last_message_at, id: ultima.id }
        : null,
  };
}

export interface ConteosInbox {
  abiertas: number;
  cerradas: number;
  con_ia: number;
}

export async function conteosInbox(
  supabase: SupabaseClient,
  orgId: string
): Promise<ConteosInbox> {
  const { data, error } = await supabase.rpc("crm_inbox_counts", {
    p_org: orgId,
  });
  if (error) return { abiertas: 0, cerradas: 0, con_ia: 0 };
  const fila = ((data as ConteosInbox[] | null) ?? [])[0];
  return {
    abiertas: Number(fila?.abiertas ?? 0),
    cerradas: Number(fila?.cerradas ?? 0),
    con_ia: Number(fila?.con_ia ?? 0),
  };
}

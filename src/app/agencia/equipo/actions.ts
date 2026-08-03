"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAgencyContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { MiembroAgencia } from "@/lib/agency/types";

/** Rol dentro de la agencia; el enum de la base solo acepta estos dos */
type RolAgencia = MiembroAgencia["role"];

export interface EstadoInvitacion {
  error: string | null;
  /**
   * Invitación recién creada. El proyecto no envía correos: el enlace se
   * devuelve para mostrarlo en pantalla y que el dueño lo mande a mano.
   */
  creada: { token: string; correo: string; rol: RolAgencia } | null;
}

export interface EstadoAccion {
  error: string | null;
}

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Nuestras RPC rechazan con `raise exception` y un motivo ya redactado en
 * español ("La agencia debe tener al menos un dueño"); Postgres las marca
 * con SQLSTATE P0001. Cualquier otro código es un error del motor, y su
 * texto trae nombres de tablas y restricciones internas que no tienen por
 * qué terminar en la pantalla de un cliente.
 */
function mensajeDeLaBase(
  error: { message?: string; code?: string } | null,
  respaldo: string
): string {
  if (error?.code !== "P0001") return respaldo;
  const texto = error.message?.trim();
  return texto ? texto : respaldo;
}

/**
 * Rol del usuario en la agencia activa.
 *
 * Las RPC ya validan que sea dueño, pero un botón que no se pintó no es un
 * permiso: cada acción vuelve a mirar el rol antes de tocar la base.
 */
async function contextoDueno(): Promise<
  { ok: true; agencyId: string; userId: string } | { ok: false; error: string }
> {
  const session = await requireAgencyContext();
  if (session.agency.role !== "owner") {
    return {
      ok: false,
      error: "Solo el dueño de la agencia puede administrar el equipo.",
    };
  }
  return { ok: true, agencyId: session.agency.id, userId: session.userId };
}

/** Crea el enlace de invitación al equipo de la agencia */
export async function invitarAlEquipo(
  _prev: EstadoInvitacion,
  formData: FormData
): Promise<EstadoInvitacion> {
  const contexto = await contextoDueno();
  if (!contexto.ok) return { error: contexto.error, creada: null };

  const correo = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const rol = String(formData.get("role") ?? "");

  if (!CORREO.test(correo)) {
    return {
      error: "Escribe el correo de la persona que quieres sumar.",
      creada: null,
    };
  }
  if (rol !== "owner" && rol !== "admin") {
    return { error: "Elige el rol que tendrá en la agencia.", creada: null };
  }

  const supabase = await createClient();

  // Invitar a quien ya entró solo genera un enlace muerto: la RPC lo
  // aceptaría igual y la persona vería "ya fue utilizada" sin entender nada.
  const { data: equipoData } = await supabase.rpc("agency_team", {
    p_agency: contexto.agencyId,
  });
  const yaEsta = ((equipoData as MiembroAgencia[] | null) ?? []).some(
    (m) => m.email.toLowerCase() === correo
  );
  if (yaEsta) {
    return {
      error: `${correo} ya pertenece al equipo de la agencia.`,
      creada: null,
    };
  }

  const { data, error } = await supabase.rpc("invite_to_agency", {
    p_agency: contexto.agencyId,
    p_email: correo,
    p_role: rol,
  });

  if (error) {
    return {
      error: mensajeDeLaBase(error, "No pudimos crear la invitación."),
      creada: null,
    };
  }

  const token = typeof data === "string" ? data : null;
  if (!token) {
    return {
      error:
        "La invitación quedó creada pero no llegó el enlace. Recarga la página y cópialo de la tabla.",
      creada: null,
    };
  }

  revalidatePath("/agencia/equipo");
  return { error: null, creada: { token, correo, rol } };
}

/** Anula un enlace de invitación que todavía no se usó */
export async function revocarInvitacion(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const contexto = await contextoDueno();
  if (!contexto.ok) return { error: contexto.error };

  const id = String(formData.get("invitation_id") ?? "").trim();
  if (!id) return { error: "No identificamos la invitación a revocar." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_agency_invitation", {
    p_id: id,
  });

  if (error) {
    return { error: mensajeDeLaBase(error, "No pudimos revocar el enlace.") };
  }

  revalidatePath("/agencia/equipo");
  return { error: null };
}

/**
 * Saca a alguien del equipo.
 *
 * La RPC impide dejar la agencia sin dueño; si el dueño se quita a sí mismo
 * (habiendo otro), pierde el panel en el mismo instante y no tiene sentido
 * devolverlo a una pantalla que ya no puede ver.
 */
export async function quitarDelEquipo(
  _prev: EstadoAccion,
  formData: FormData
): Promise<EstadoAccion> {
  const contexto = await contextoDueno();
  if (!contexto.ok) return { error: contexto.error };

  const userId = String(formData.get("user_id") ?? "").trim();
  if (!userId) return { error: "No identificamos a la persona a quitar." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_agency_member", {
    p_agency: contexto.agencyId,
    p_user: userId,
  });

  if (error) {
    return {
      error: mensajeDeLaBase(error, "No pudimos quitar a esa persona."),
    };
  }

  revalidatePath("/agencia/equipo");
  if (userId === contexto.userId) redirect("/agencia");

  return { error: null };
}

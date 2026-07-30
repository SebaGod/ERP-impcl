"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_ORG_COOKIE, getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateRut } from "@/lib/format";
import { defaultTemplate } from "@/templates/imprenta";

export interface ActionState {
  error: string | null;
}

/** Un año: la subcuenta activa persiste entre sesiones del navegador */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

async function setActiveOrgCookie(orgId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

/** Agencia del usuario o null; centraliza el chequeo de las acciones */
async function requireAgency() {
  const session = await getSessionContext();
  return session?.agency ?? null;
}

/** Crea la agencia y adopta las organizaciones existentes del usuario */
export async function createAgency(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) {
    return { error: "Ingresa el nombre de tu agencia" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_agency", { p_name: name });
  if (error) {
    return { error: "No pudimos crear la agencia. Intenta de nuevo." };
  }

  redirect("/agencia");
}

/** Crea una subcuenta de cliente, opcionalmente desde una plantilla */
export async function createSubaccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const rut = String(formData.get("rut") ?? "").trim();
  const snapshotId = String(formData.get("snapshot_id") ?? "").trim();

  if (name.length < 2) {
    return { error: "Ingresa el nombre del cliente" };
  }
  if (rut && !validateRut(rut)) {
    return { error: "El RUT no es válido (revisa el dígito verificador)" };
  }

  const agency = await requireAgency();
  if (!agency) return { error: "No perteneces a ninguna agencia" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_subaccount_from_snapshot", {
    p_agency: agency.id,
    p_name: name,
    p_rut: rut || null,
    p_snapshot: snapshotId || null,
    // Sin plantilla se siembra el catálogo por defecto
    p_template: snapshotId ? {} : defaultTemplate,
  });

  if (error) {
    return { error: "No pudimos crear la subcuenta. Intenta de nuevo." };
  }

  // Ficha comercial inicial, si se completó en el formulario
  const orgId = typeof data === "string" ? data : null;
  if (orgId) {
    const status = String(formData.get("status") ?? "").trim();
    const plan = String(formData.get("plan") ?? "").trim();
    const fee = Number(formData.get("monthly_fee") ?? 0);
    const contactName = String(formData.get("contact_name") ?? "").trim();
    const contactEmail = String(formData.get("contact_email") ?? "").trim();
    const contactPhone = String(formData.get("contact_phone") ?? "").trim();

    if (status || plan || fee || contactName || contactEmail || contactPhone) {
      await supabase.rpc("update_subaccount_profile", {
        p_org: orgId,
        p_status: status || null,
        p_plan: plan || null,
        p_monthly_fee: Number.isFinite(fee) && fee > 0 ? fee : null,
        p_contact_name: contactName || null,
        p_contact_email: contactEmail || null,
        p_contact_phone: contactPhone || null,
        p_notes: null,
      });
    }
  }

  revalidatePath("/agencia");
  redirect("/agencia");
}

/** Actualiza la ficha comercial de una subcuenta */
export async function updateSubaccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { error: "Falta la subcuenta" };

  const fee = Number(formData.get("monthly_fee") ?? 0);
  if (!Number.isFinite(fee) || fee < 0) {
    return { error: "El cobro mensual no es válido" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_subaccount_profile", {
    p_org: orgId,
    p_status: String(formData.get("status") ?? "").trim() || null,
    p_plan: String(formData.get("plan") ?? "").trim() || null,
    p_monthly_fee: fee,
    p_contact_name: String(formData.get("contact_name") ?? "").trim() || null,
    p_contact_email: String(formData.get("contact_email") ?? "").trim() || null,
    p_contact_phone: String(formData.get("contact_phone") ?? "").trim() || null,
    p_notes: String(formData.get("notes") ?? "").trim() || null,
  });

  if (error) return { error: "No pudimos guardar los cambios." };

  revalidatePath("/agencia");
  revalidatePath(`/agencia/subcuentas/${orgId}`);
  return { error: null };
}

/** Cambia solo el estado (activa/prueba/pausada) desde la tabla */
export async function setSubaccountStatus(orgId: string, status: string) {
  const supabase = await createClient();
  await supabase.rpc("update_subaccount_profile", {
    p_org: orgId,
    p_status: status,
    p_plan: null,
    p_monthly_fee: null,
    p_contact_name: null,
    p_contact_email: null,
    p_contact_phone: null,
    p_notes: null,
  });
  revalidatePath("/agencia");
  revalidatePath(`/agencia/subcuentas/${orgId}`);
}

/** Captura la configuración de una subcuenta como plantilla reutilizable */
export async function createSnapshot(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const orgId = String(formData.get("org_id") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!orgId) return { error: "Elige la subcuenta a capturar" };
  if (name.length < 2) return { error: "Ponle un nombre a la plantilla" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_agency_snapshot", {
    p_org: orgId,
    p_name: name,
    p_description: description || null,
  });

  if (error) return { error: "No pudimos crear la plantilla." };

  revalidatePath("/agencia/plantillas");
  redirect("/agencia/plantillas");
}

/** Aplica una plantilla sobre una subcuenta existente (aditivo) */
export async function applySnapshot(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const snapshotId = String(formData.get("snapshot_id") ?? "").trim();
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!snapshotId || !orgId) return { error: "Falta la plantilla o la subcuenta" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_agency_snapshot", {
    p_snapshot: snapshotId,
    p_org: orgId,
  });

  if (error) return { error: "No pudimos aplicar la plantilla." };

  revalidatePath("/agencia");
  revalidatePath(`/agencia/subcuentas/${orgId}`);
  return { error: null };
}

/** Elimina una plantilla */
export async function deleteSnapshot(snapshotId: string) {
  const supabase = await createClient();
  await supabase.from("agency_snapshots").delete().eq("id", snapshotId);
  revalidatePath("/agencia/plantillas");
  redirect("/agencia/plantillas");
}

/** Cambia la subcuenta activa (switcher). Valida el acceso antes de fijarla. */
export async function switchOrg(orgId: string, nextPath = "/inicio") {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!session.orgs.some((o) => o.id === orgId)) {
    redirect("/agencia");
  }

  await setActiveOrgCookie(orgId);
  revalidatePath("/", "layout");
  redirect(nextPath);
}

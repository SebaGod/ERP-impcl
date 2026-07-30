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

/** Crea una subcuenta de cliente dentro de la agencia */
export async function createSubaccount(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const rut = String(formData.get("rut") ?? "").trim();

  if (name.length < 2) {
    return { error: "Ingresa el nombre del cliente" };
  }
  if (rut && !validateRut(rut)) {
    return { error: "El RUT no es válido (revisa el dígito verificador)" };
  }

  const session = await getSessionContext();
  if (!session?.agency) {
    return { error: "No perteneces a ninguna agencia" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_agency_subaccount", {
    p_agency: session.agency.id,
    p_name: name,
    p_rut: rut || null,
    p_template: defaultTemplate,
  });

  if (error) {
    return { error: "No pudimos crear la subcuenta. Intenta de nuevo." };
  }

  // Entrar directo a la subcuenta recién creada
  if (typeof data === "string") await setActiveOrgCookie(data);
  redirect("/inicio");
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

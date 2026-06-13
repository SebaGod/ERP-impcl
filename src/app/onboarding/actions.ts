"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateRut } from "@/lib/format";
import { defaultTemplate } from "@/templates/imprenta";

export interface CreateOrgState {
  error: string | null;
}

export async function createOrganization(
  _prev: CreateOrgState,
  formData: FormData
): Promise<CreateOrgState> {
  const name = String(formData.get("name") ?? "").trim();
  const rut = String(formData.get("rut") ?? "").trim();

  if (name.length < 2) {
    return { error: "Ingresa el nombre de tu empresa" };
  }
  if (rut && !validateRut(rut)) {
    return { error: "El RUT no es válido (revisa el dígito verificador)" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization_with_template", {
    p_name: name,
    p_rut: rut || null,
    p_template: defaultTemplate,
  });

  if (error) {
    return { error: "No pudimos crear la organización. Intenta de nuevo." };
  }

  redirect("/inicio");
}

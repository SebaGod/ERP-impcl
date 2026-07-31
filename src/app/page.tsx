import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { modules } from "@/lib/auth/permissions";

export default async function Home() {
  const session = await getSessionContext();

  if (!session) redirect("/login");
  if (!session.org) redirect("/onboarding");

  // Entra al primer módulo que esta persona puede ver, en el orden del menú:
  // un vendedor cae en el dashboard y alguien de producción en el tablero,
  // sin hardcodear el rol.
  const primero = modules.find((m) => session.permisos.includes(m.key));
  redirect(primero?.href ?? "/dashboard");
}

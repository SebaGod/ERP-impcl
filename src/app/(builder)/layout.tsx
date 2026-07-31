import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";

/**
 * Lienzo a pantalla completa.
 *
 * El constructor de flujos necesita todo el ancho, así que estas rutas viven
 * fuera del shell de la aplicación: sin barra lateral ni cabecera. La sesión se
 * valida igual que en el resto de la app.
 */
export default async function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionContext();
  if (!session) redirect("/login");
  if (!session.org || !session.role) {
    redirect(session.agency ? "/agencia" : "/onboarding");
  }
  if (session.role !== "admin") redirect("/");

  return <div className="flex h-dvh flex-col bg-muted/30">{children}</div>;
}

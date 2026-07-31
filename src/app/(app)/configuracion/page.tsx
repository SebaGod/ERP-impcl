import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrgForm } from "./org-form";

export const metadata: Metadata = { title: "Configuración" };

export default async function ConfiguracionPage() {
  const session = await requireAdminContext();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Perfil de empresa</CardTitle>
          <CardDescription>
            Estos datos aparecerán en tus cotizaciones.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrgForm name={session.org.name} rut={session.org.rut ?? ""} />
        </CardContent>
      </Card>
    </div>
  );
}

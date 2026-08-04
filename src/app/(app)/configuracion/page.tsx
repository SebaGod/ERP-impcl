import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { regionDe } from "@/lib/locale";
import { OrgForm, RegionForm } from "./org-form";

export const metadata: Metadata = { title: "Configuración" };

/** Los tres campos regionales no viajan en la sesión: se piden acá */
interface RegionRow {
  timezone: string | null;
  currency: string | null;
  locale: string | null;
}

export default async function ConfiguracionPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: regionData, error: regionError } = await supabase
    .from("organizations")
    .select("timezone, currency, locale")
    .eq("id", session.org.id)
    .maybeSingle<RegionRow>();

  // Acá "no hay fila" no es un estado legítimo: estamos parados DENTRO de
  // esta organización. Si no vuelve, algo falló, y pintar el formulario
  // con los defaults diría "Chile" sobre una cuenta que quizá es peruana.
  const regionCaida = Boolean(regionError) || !regionData;
  const region = regionData ? regionDe(regionData) : null;

  // Un instante único para toda la página: el ejemplo de fecha del
  // formulario tiene que ser el mismo en el servidor y en el navegador.
  const instanteEjemplo = new Date().toISOString();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      {regionCaida && <QueryError partes={["la configuración regional"]} />}

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

      {region && (
        <Card>
          <CardHeader>
            <CardTitle>Región</CardTitle>
            <CardDescription>
              Elige el país y quedan fijados los tres valores de abajo. Si
              necesitas otra combinación, edítalos uno por uno.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RegionForm region={region} instanteEjemplo={instanteEjemplo} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

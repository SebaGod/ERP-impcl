import type { Metadata } from "next";
import { requireAdminContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { QueryError } from "@/components/query-error";
import { regionDe } from "@/lib/locale";
import { faltantesEmisor } from "@/lib/dte/validacion";
import { DatosTributariosForm, OrgForm, RegionForm } from "./org-form";

export const metadata: Metadata = { title: "Configuración" };

/** Lo que no viaja en la sesión y se pide acá */
interface OrgRow {
  timezone: string | null;
  currency: string | null;
  locale: string | null;
  razon_social: string | null;
  giro: string | null;
  acteco: number | null;
  direccion: string | null;
  comuna: string | null;
  ciudad: string | null;
}

export default async function ConfiguracionPage() {
  const session = await requireAdminContext();
  const supabase = await createClient();

  const { data: regionData, error: regionError } = await supabase
    .from("organizations")
    .select(
      "timezone, currency, locale, razon_social, giro, acteco, direccion, comuna, ciudad"
    )
    .eq("id", session.org.id)
    .maybeSingle<OrgRow>();

  // Acá "no hay fila" no es un estado legítimo: estamos parados DENTRO de
  // esta organización. Si no vuelve, algo falló, y pintar el formulario
  // con los defaults diría "Chile" sobre una cuenta que quizá es peruana.
  const regionCaida = Boolean(regionError) || !regionData;
  const region = regionData ? regionDe(regionData) : null;

  // Lo mismo vale para los datos tributarios: si la consulta se cayó, un
  // formulario vacío se lee como "no tengo nada cargado" y el usuario
  // reescribiría encima lo que sí estaba guardado.
  const tributarios = regionData
    ? {
        razon_social: regionData.razon_social ?? "",
        giro: regionData.giro ?? "",
        acteco: regionData.acteco ? String(regionData.acteco) : "",
        direccion: regionData.direccion ?? "",
        comuna: regionData.comuna ?? "",
        ciudad: regionData.ciudad ?? "",
      }
    : null;

  // El RUT vive en el perfil de arriba, pero el SII lo exige igual que el
  // resto: se revisa todo junto para que el aviso diga la verdad completa.
  const faltantes = regionData
    ? faltantesEmisor({
        rut: session.org.rut ?? null,
        razon_social: regionData.razon_social,
        name: session.org.name,
        giro: regionData.giro,
        acteco: regionData.acteco,
        direccion: regionData.direccion,
        comuna: regionData.comuna,
      })
    : [];

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

      {tributarios && (
        <Card>
          <CardHeader>
            <CardTitle>Datos tributarios (SII)</CardTitle>
            <CardDescription>
              {faltantes.length === 0
                ? "Están completos. Es lo que va impreso en cada boleta y factura que emitas."
                : `Faltan ${faltantes.length} ${faltantes.length === 1 ? "dato" : "datos"}. Sin ellos el SII rechaza el documento completo y el folio se pierde.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DatosTributariosForm
              datos={tributarios}
              faltantes={faltantes}
            />
          </CardContent>
        </Card>
      )}

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

"use client";

/**
 * Los tres campos regionales de una subcuenta, con selector de país.
 *
 * Se comparte entre la configuración del cliente y la ficha de la
 * agencia: son la misma decisión tomada desde dos lugares, y si cada
 * pantalla armara su propio formulario terminarían ofreciendo opciones
 * distintas para el mismo dato.
 *
 * Solo dibuja los campos; el <form> y la server action los pone quien lo
 * usa, porque cada superficie guarda contra una acción distinta y valida
 * permisos distintos.
 */

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  REGIONES,
  formatFechaHora,
  formatMonto,
  type ConfigRegional,
} from "@/lib/locale";
import { paisDe } from "./validacion";

/** Marcador del selector cuando la combinación no calza con ningún país */
const OTRA = "__otra__";

/**
 * Monto de muestra. Es un ejemplo declarado como tal, no un dato de la
 * cuenta: sirve para ver el separador de miles y el símbolo antes de
 * guardar.
 */
const MONTO_EJEMPLO = 1250000;

function vistaPrevia(
  config: ConfigRegional,
  instante: string
): { monto: string; fechaHora: string } | null {
  try {
    return {
      monto: formatMonto(MONTO_EJEMPLO, config),
      fechaHora: formatFechaHora(instante, config),
    };
  } catch {
    // Intl rechaza combinaciones imposibles. Mostrar un ejemplo a medias
    // sería peor que no mostrarlo: la validación real está en el servidor.
    return null;
  }
}

export function CamposRegion({
  guardada,
  instanteEjemplo,
  idPrefix = "region",
}: {
  /** Lo que hay hoy en la base: contra esto se compara si hubo cambio */
  guardada: ConfigRegional;
  /**
   * Instante fijo enviado por el servidor. Con `new Date()` el HTML del
   * servidor y el del navegador se generan con relojes distintos y React
   * marca error de hidratación por un segundo de diferencia.
   */
  instanteEjemplo: string;
  idPrefix?: string;
}) {
  const [config, setConfig] = useState<ConfigRegional>(guardada);

  const pais = paisDe(config);
  const previa = vistaPrevia(config, instanteEjemplo);
  const cambioMoneda = config.currency !== guardada.currency;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-pais`}>País</Label>
        <Select
          id={`${idPrefix}-pais`}
          value={pais ?? OTRA}
          onChange={(event) => {
            const elegido = REGIONES.find((r) => r.pais === event.target.value);
            if (elegido) setConfig(elegido.config);
          }}
        >
          {REGIONES.map((region) => (
            <option key={region.pais} value={region.pais}>
              {region.pais}
            </option>
          ))}
          {/* Solo aparece cuando los tres campos no calzan con un país:
              así el selector nunca muestra un país que no es el que rige. */}
          {pais === null && (
            <option value={OTRA}>Combinación personalizada</option>
          )}
        </Select>
        <p className="text-xs text-muted-foreground">
          Define la hora a la que se agendan y se muestran las citas, el corte
          de día de los reportes y el símbolo con que se escriben los montos.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-timezone`}>Zona horaria</Label>
          <Input
            id={`${idPrefix}-timezone`}
            name="timezone"
            list={`${idPrefix}-zonas`}
            value={config.timezone}
            onChange={(event) =>
              setConfig({ ...config, timezone: event.target.value })
            }
            required
          />
          <datalist id={`${idPrefix}-zonas`}>
            {REGIONES.map((region) => (
              <option key={region.config.timezone} value={region.config.timezone} />
            ))}
          </datalist>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-currency`}>Moneda</Label>
          <Input
            id={`${idPrefix}-currency`}
            name="currency"
            maxLength={3}
            placeholder="CLP"
            className="uppercase"
            value={config.currency}
            onChange={(event) =>
              setConfig({ ...config, currency: event.target.value })
            }
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idPrefix}-locale`}>Idioma</Label>
          <Input
            id={`${idPrefix}-locale`}
            name="locale"
            placeholder="es-CL"
            value={config.locale}
            onChange={(event) =>
              setConfig({ ...config, locale: event.target.value })
            }
            required
          />
        </div>
      </div>

      {previa ? (
        <p className="text-xs text-muted-foreground">
          Así se verán:{" "}
          {/* suppressHydrationWarning: la versión de ICU del servidor y la
              del navegador pueden separar los miles con espacios distintos
              para el mismo idioma. Es el ejemplo, no el dato. */}
          <span
            className="font-medium text-foreground tabular-nums"
            suppressHydrationWarning
          >
            {previa.monto}
          </span>{" "}
          (monto de ejemplo) y{" "}
          <span
            className="font-medium text-foreground tabular-nums"
            suppressHydrationWarning
          >
            {previa.fechaHora}
          </span>{" "}
          (el momento en que abriste esta página, en la hora de la cuenta).
        </p>
      ) : (
        <p className="text-xs text-warning">
          Con estos valores no podemos formatear montos ni fechas. Revísalos
          antes de guardar.
        </p>
      )}

      {(cambioMoneda || config.currency !== "CLP") && (
        <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          {cambioMoneda
            ? `Vas a pasar de ${guardada.currency} a ${config.currency}. Los montos ya cargados no se convierten: cada cotización, cobro y gasto conserva el mismo número y solo cambia el símbolo con que se muestra.`
            : `Esta cuenta muestra sus montos en ${config.currency}. Los que se cargaron cuando la moneda era otra conservan su número original: nadie los convirtió.`}
        </p>
      )}
    </div>
  );
}

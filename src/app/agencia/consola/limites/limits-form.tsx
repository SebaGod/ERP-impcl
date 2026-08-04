"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatUsd } from "@/lib/agent/pricing";
import { statusLabels, statusVariants, type SubaccountStatus } from "@/lib/agency/types";
import { guardarTopes, type EstadoTopes } from "./actions";

/**
 * Qué tan cerca está una subcuenta de quedarse sin agente.
 *
 * "desconocido" no es un estado decorativo: cuando la consulta del gasto
 * falla hay que decirlo, porque un 0% dibujado sobre una consulta caída se
 * lee como "esta subcuenta no ha gastado nada".
 */
export type NivelTope = "ok" | "cerca" | "alcanzado" | "apagado" | "desconocido";

export interface FilaTopes {
  orgId: string;
  nombre: string;
  estado: SubaccountStatus;
  /** null = no pudimos leer el gasto (distinto de "gastó cero") */
  gastoDia: number | null;
  gastoMes: number | null;
  limiteDia: number;
  limiteMes: number;
  nivel: NivelTope;
  /**
   * Nivel de cada periodo por separado. Un cliente puede estar al tope del día
   * con el mes casi intacto: pintar las dos barras del mismo color diría que
   * se acabó el mes cuando lo que se acabó es la tarde.
   */
  nivelDia: NivelTope;
  nivelMes: NivelTope;
  /** Cuál de los dos techos fue el que detuvo al agente */
  corte: "dia" | "mes" | null;
  /** Corridas antiguas sin costo guardado, que el tope no alcanza a contar */
  corridasSinCosto: number;
  /** Lo que habrían costado esas corridas, calculado con sus tokens */
  estimadoSinCosto: number;
}

const INICIAL: EstadoTopes = { error: null };

/** Columnas de la tabla, para el colSpan de la fila de mensajes */
const COLUMNAS = 6;

const fondoPorNivel: Record<NivelTope, string> = {
  ok: "",
  cerca: "bg-warning/5",
  alcanzado: "bg-destructive/5",
  apagado: "bg-muted/40",
  desconocido: "",
};

const barraPorNivel: Record<NivelTope, string> = {
  ok: "bg-primary",
  cerca: "bg-warning",
  alcanzado: "bg-destructive",
  apagado: "bg-muted-foreground",
  desconocido: "bg-muted-foreground",
};

/** Porcentaje consumido; con tope 0 no hay porcentaje que calcular */
function porcentaje(gasto: number, limite: number): number | null {
  if (limite <= 0) return null;
  return (gasto / limite) * 100;
}

/**
 * Una subcuenta con sus dos topes editables en línea.
 *
 * Los dos campos viven en celdas distintas de la fila, así que se asocian al
 * formulario por su id (atributo `form`): una tabla no admite envolver varias
 * celdas en un <form>, y separar el editor de su fila obligaría a buscar de
 * qué cliente era cada campo.
 */
export function FilaTopesSubcuenta({ fila }: { fila: FilaTopes }) {
  const [estado, accion, pendiente] = useActionState(guardarTopes, INICIAL);
  const formId = `topes-${fila.orgId}`;

  return (
    <>
      <tr
        className={cn(
          "border-b border-border transition-colors duration-150",
          fondoPorNivel[fila.nivel]
        )}
      >
        <td className="py-2.5 pr-3 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{fila.nombre}</span>
            {fila.estado !== "activa" && (
              <Badge variant={statusVariants[fila.estado]}>
                {statusLabels[fila.estado]}
              </Badge>
            )}
            {fila.nivel === "alcanzado" && (
              <Badge variant="destructive">
                {fila.corte === "mes" ? "Tope mensual alcanzado" : "Tope diario alcanzado"}
              </Badge>
            )}
            {fila.nivel === "cerca" && <Badge variant="warning">Cerca del tope</Badge>}
            {fila.nivel === "apagado" && (
              <Badge variant="outline">Agente sin presupuesto</Badge>
            )}
            {fila.nivel === "desconocido" && (
              <Badge variant="outline">Gasto no disponible</Badge>
            )}
          </div>
          {fila.nivel === "alcanzado" && (
            <p className="pt-1 text-xs text-muted-foreground">
              {fila.corte === "mes"
                ? "Su agente vuelve a responder el día 1 del próximo mes, o apenas subas el tope mensual."
                : "Su agente vuelve a responder a la medianoche de su zona horaria, o apenas subas el tope diario."}
            </p>
          )}
          {fila.corridasSinCosto > 0 && (
            <p className="pt-1 text-xs text-muted-foreground">
              {fila.corridasSinCosto}{" "}
              {fila.corridasSinCosto === 1 ? "corrida antigua" : "corridas antiguas"} sin
              costo guardado (≈ {formatUsd(fila.estimadoSinCosto)} según sus tokens). No
              entran en las cifras de esta fila ni en el corte del tope.
            </p>
          )}
        </td>

        <td className="py-2.5 pr-3 align-top">
          <Input
            // El key ata el campo al valor guardado: si la acción redondea lo
            // escrito, el campo se vuelve a montar con lo que quedó en la base
            // en vez de seguir mostrando lo que la persona tecleó.
            key={fila.limiteDia}
            form={formId}
            name="limite_dia"
            type="number"
            min={0}
            step={0.5}
            inputMode="decimal"
            defaultValue={fila.limiteDia}
            aria-label={`Tope diario de ${fila.nombre}, en dólares`}
            className="h-9 w-24 tabular-nums"
          />
        </td>

        <td className="py-2.5 pr-3 align-top">
          <Consumo
            gasto={fila.gastoDia}
            limite={fila.limiteDia}
            nivel={fila.nivelDia}
          />
        </td>

        <td className="py-2.5 pr-3 align-top">
          <Input
            key={fila.limiteMes}
            form={formId}
            name="limite_mes"
            type="number"
            min={0}
            step={5}
            inputMode="decimal"
            defaultValue={fila.limiteMes}
            aria-label={`Tope mensual de ${fila.nombre}, en dólares`}
            className="h-9 w-24 tabular-nums"
          />
        </td>

        <td className="py-2.5 pr-3 align-top">
          <Consumo
            gasto={fila.gastoMes}
            limite={fila.limiteMes}
            nivel={fila.nivelMes}
          />
        </td>

        <td className="py-2.5 text-right align-top">
          <form id={formId} action={accion}>
            <input type="hidden" name="org_id" value={fila.orgId} />
            <Button type="submit" variant="secondary" size="sm" disabled={pendiente}>
              {pendiente ? "Guardando…" : "Guardar"}
            </Button>
          </form>
        </td>
      </tr>

      {(estado.error || (estado.ok && !pendiente)) && (
        <tr className={cn("border-b border-border", fondoPorNivel[fila.nivel])}>
          <td colSpan={COLUMNAS} className="pb-2.5 text-sm">
            {estado.error ? (
              <span className="text-destructive">{estado.error}</span>
            ) : (
              <span className="text-success">
                Topes de {fila.nombre} guardados. Rigen desde el próximo mensaje.
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/** Gasto de un periodo contra su tope: monto, barra y porcentaje */
function Consumo({
  gasto,
  limite,
  nivel,
}: {
  gasto: number | null;
  limite: number;
  nivel: NivelTope;
}) {
  if (gasto === null) {
    return (
      <span className="text-sm text-muted-foreground">
        —<span className="block text-xs">sin dato</span>
      </span>
    );
  }

  const parte = porcentaje(gasto, limite);

  return (
    <div className="flex w-32 flex-col gap-1">
      <span className="text-sm tabular-nums">{formatUsd(gasto)}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
        <div
          className={cn("h-full rounded-full", barraPorNivel[nivel])}
          style={{ width: `${Math.min(100, parte ?? 100).toFixed(1)}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {parte === null
          ? "tope en 0"
          : `${parte.toFixed(0)}% de ${formatUsd(limite)}`}
      </span>
    </div>
  );
}

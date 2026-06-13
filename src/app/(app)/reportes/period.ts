import { todayISO } from "@/lib/format";

export type PeriodKey = "mes" | "anio" | "todo";

export const periodLabels: Record<PeriodKey, string> = {
  mes: "Este mes",
  anio: "Este año",
  todo: "Todo",
};

export interface PeriodRange {
  key: PeriodKey;
  label: string;
  /** ISO inclusivo */
  from: string;
  /** ISO exclusivo (límite superior) */
  toExclusive: string;
}

/** Rango de fechas para el periodo seleccionado, en hora de Chile. */
export function resolvePeriod(raw: string | undefined): PeriodRange {
  const key: PeriodKey =
    raw === "anio" || raw === "todo" ? raw : "mes";
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));

  if (key === "anio") {
    return {
      key,
      label: periodLabels.anio,
      from: `${year}-01-01`,
      toExclusive: `${year + 1}-01-01`,
    };
  }
  if (key === "todo") {
    return {
      key,
      label: periodLabels.todo,
      from: "1970-01-01",
      toExclusive: "2999-01-01",
    };
  }
  const nextMonth =
    month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return {
    key,
    label: periodLabels.mes,
    from: `${today.slice(0, 7)}-01`,
    toExclusive: nextMonth,
  };
}

/**
 * Gráficos del dashboard dibujados a mano: divs con Tailwind para las
 * barras y SVG con stroke-dasharray para el donut. Son Server Components
 * estáticos: la única interacción es el tooltip nativo del navegador.
 */

/** Paleta fija para series (orden estable entre gráficos) */
export const chartPalette = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#dc2626",
  "#0891b2",
  "#be185d",
  "#65a30d",
] as const;

function formatNumber(value: number): string {
  return value.toLocaleString("es-CL");
}

function ChartEmpty({ text = "Sin datos en este rango." }: { text?: string }) {
  return (
    <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-border">
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

/** Barras verticales agrupadas (p. ej. ingreso vs gasto por mes) */
export function BarChart({
  series,
}: {
  series: {
    label: string;
    values: { name: string; value: number; color: string }[];
  }[];
}) {
  const max = Math.max(0, ...series.flatMap((s) => s.values.map((v) => v.value)));
  if (series.length === 0 || max <= 0) return <ChartEmpty />;

  // Leyenda: nombres únicos en orden de aparición
  const legend: { name: string; color: string }[] = [];
  for (const s of series) {
    for (const v of s.values) {
      if (!legend.some((l) => l.name === v.name)) {
        legend.push({ name: v.name, color: v.color });
      }
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-40 items-end gap-2">
        {series.map((s) => (
          <div
            key={s.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5"
          >
            <div className="flex h-32 w-full items-end justify-center gap-1">
              {s.values.map((v) => (
                <div
                  key={v.name}
                  title={`${s.label} · ${v.name}: ${formatNumber(v.value)}`}
                  className="w-full max-w-9 rounded-t-sm"
                  style={{
                    height: `${v.value > 0 ? Math.max(2, Math.round((v.value / max) * 100)) : 0}%`,
                    backgroundColor: v.color,
                  }}
                />
              ))}
            </div>
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {s.label}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {legend.map((l) => (
          <span
            key={l.name}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: l.color }}
            />
            {l.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Barras horizontales con etiqueta, pista y valor a la derecha */
export function HBarChart({
  items,
}: {
  items: { label: string; value: number; color: string; hint?: string }[];
}) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0 || max <= 0) return <ChartEmpty />;

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="flex items-center gap-3"
          title={`${item.label}: ${item.hint ?? formatNumber(item.value)}`}
        >
          <span className="w-28 shrink-0 truncate text-sm text-muted-foreground">
            {item.label}
          </span>
          <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${item.value > 0 ? Math.max(2, Math.round((item.value / max) * 100)) : 0}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
          <span className="shrink-0 text-sm font-medium tabular-nums">
            {item.hint ?? formatNumber(item.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Líneas sobre una grilla, para series de tiempo.
 *
 * Cada serie se normaliza contra el máximo común, así que compara bien
 * magnitudes parecidas (clientes nuevos vs. acumulados). Para mezclar
 * unidades muy distintas —pesos contra unidades— van dos gráficos, no
 * dos ejes: un eje secundario invita a leer cruces que no existen.
 */
export function LineChart({
  labels,
  series,
  alto = 180,
  formatValor,
}: {
  labels: string[];
  series: { name: string; values: number[]; color: string }[];
  alto?: number;
  formatValor?: (valor: number) => string;
}) {
  const todos = series.flatMap((s) => s.values);
  const max = Math.max(0, ...todos);
  if (labels.length === 0 || series.length === 0 || max <= 0) return <ChartEmpty />;

  // Coordenadas internas del viewBox; el SVG se estira al contenedor.
  const ancho = 600;
  const padX = 8;
  const padY = 10;
  const util = alto - padY * 2;
  const pasos = Math.max(1, labels.length - 1);
  const formato = formatValor ?? formatNumber;

  const x = (i: number) => padX + (i * (ancho - padX * 2)) / pasos;
  const y = (v: number) => padY + util - (v / max) * util;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg
          viewBox={`0 0 ${ancho} ${alto}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: alto }}
          role="img"
        >
          {/* Grilla horizontal: cuatro cortes bastan para ubicar la altura */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <line
              key={f}
              x1={padX}
              x2={ancho - padX}
              y1={padY + util * f}
              y2={padY + util * f}
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {series.map((s) => {
            const puntos = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
            return (
              <g key={s.name}>
                <polyline
                  points={puntos}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color}>
                    <title>{`${labels[i]} · ${s.name}: ${formato(v)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-y-0 left-0 flex flex-col justify-between py-1 text-[10px] tabular-nums text-muted-foreground">
          <span>{formato(max)}</span>
          <span>{formato(0)}</span>
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        {labels.map((l, i) => (
          // Con muchos meses solo se rotula uno de cada dos: si no, se
          // pisan las etiquetas y no se lee ninguna.
          <span key={`${l}-${i}`} className="truncate">
            {labels.length > 8 && i % 2 === 1 ? "" : l}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span
            key={s.name}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="h-0.5 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Donut SVG (técnica de stroke-dasharray sobre circle) con leyenda */
export function DonutChart({
  items,
  centerLabel,
}: {
  items: { label: string; value: number; color: string }[];
  centerLabel?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0) return <ChartEmpty />;

  const visibles = items.filter((item) => item.value > 0);
  const segments = visibles.map((item, i) => ({
    ...item,
    pct: (item.value / total) * 100,
    offset: visibles
      .slice(0, i)
      .reduce((sum, previo) => sum + (previo.value / total) * 100, 0),
  }));

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90">
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="5"
          />
          {segments.map((s) => (
            <circle
              key={s.label}
              cx="21"
              cy="21"
              r="15.9155"
              fill="none"
              stroke={s.color}
              strokeWidth="5"
              strokeDasharray={`${s.pct} ${100 - s.pct}`}
              strokeDashoffset={-s.offset}
            >
              <title>{`${s.label}: ${formatNumber(s.value)} (${Math.round(s.pct)}%)`}</title>
            </circle>
          ))}
        </svg>
        {centerLabel && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="max-w-24 truncate text-center text-lg font-semibold tabular-nums">
              {centerLabel}
            </span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatNumber(s.value)}
            </span>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
              {Math.round(s.pct)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useActionState, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMonto, type ConfigRegional } from "@/lib/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ContactPicker } from "@/components/contact-picker";
import { calcularDte, type LineaDte } from "@/lib/dte/montos";
import { TIPOS_DTE, TIPOS_EMISION, tipoDte, type CodigoDte } from "@/lib/dte/tipos";
import { crearDocumento, type EstadoAccion } from "../actions";

const inicial: EstadoAccion = { error: null };

interface Fila {
  id: number;
  descripcion: string;
  cantidad: string;
  precio: string;
  exenta: boolean;
}

function filaVacia(id: number): Fila {
  return { id, descripcion: "", cantidad: "1", precio: "", exenta: false };
}

/** Los puntos son separador de miles en Chile, no decimales */
function aPesos(texto: string): number {
  const n = Number(texto.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function aCantidad(texto: string): number {
  const n = Number(texto.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function DocumentoForm({
  region,
  hoy,
  tipoInicial = 39,
}: {
  region: ConfigRegional;
  /** El día del negocio, calculado en el servidor */
  hoy: string;
  tipoInicial?: CodigoDte;
}) {
  const [state, formAction, pending] = useActionState(crearDocumento, inicial);
  const [codigo, setCodigo] = useState<CodigoDte>(tipoInicial);
  const [filas, setFilas] = useState<Fila[]>([filaVacia(0)]);
  const [siguienteId, setSiguienteId] = useState(1);

  const tipo = tipoDte(codigo);

  // El mismo cálculo que usa el servidor al guardar: si la pantalla
  // sumara por su cuenta, el usuario vería un total y se guardaría otro.
  const calculo = useMemo(() => {
    const lineas: LineaDte[] = filas
      .filter((f) => f.descripcion.trim() !== "")
      .map((f) => ({
        descripcion: f.descripcion,
        cantidad: aCantidad(f.cantidad) || 1,
        precioUnitario: aPesos(f.precio),
        exenta: f.exenta,
      }));
    return calcularDte(codigo, lineas);
  }, [filas, codigo]);

  function actualizar(id: number, patch: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  function agregar() {
    setFilas((prev) => [...prev, filaVacia(siguienteId)]);
    setSiguienteId((n) => n + 1);
  }

  function quitar(id: number) {
    setFilas((prev) => (prev.length === 1 ? prev : prev.filter((f) => f.id !== id)));
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="tipo" value={codigo} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-tipo">Tipo de documento *</Label>
          <Select
            id="doc-tipo"
            value={String(codigo)}
            onChange={(e) => setCodigo(Number(e.target.value) as CodigoDte)}
          >
            {TIPOS_EMISION.map((c) => (
              <option key={c} value={c}>
                {TIPOS_DTE[c].nombre}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">{tipo.descripcion}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="doc-fecha">Fecha de emisión</Label>
          <Input id="doc-fecha" name="fecha_emision" type="date" defaultValue={hoy} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>
          Cliente {tipo.exigeReceptor ? "*" : <span className="font-normal text-muted-foreground">(opcional)</span>}
        </Label>
        {tipo.exigeReceptor ? (
          <ContactPicker name="contact_id" />
        ) : (
          <>
            <ContactPicker name="contact_id" requerido={false} />
            <p className="text-xs text-muted-foreground">
              Una boleta se le puede emitir a alguien sin identificar. Si eliges
              un cliente, queda asociada a su ficha.
            </p>
          </>
        )}
      </div>

      {/* El aviso que evita el error más caro del rubro */}
      <div
        className={cn(
          "rounded-lg border p-3 text-sm",
          tipo.preciosConIva
            ? "border-primary/30 bg-primary/5"
            : "border-border bg-muted/40"
        )}
      >
        {tipo.preciosConIva ? (
          <>
            <strong className="font-medium">Los precios llevan IVA incluido.</strong>{" "}
            Escribe lo que el cliente paga: si cobras $10.000, escribe 10000 y
            abajo verás cuánto de eso es neto y cuánto IVA.
          </>
        ) : (
          <>
            <strong className="font-medium">Los precios son netos.</strong> El
            IVA se calcula y se suma abajo.
          </>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Detalle *</Label>
          <Button type="button" variant="secondary" size="sm" onClick={agregar}>
            <Plus className="size-3.5" /> Agregar línea
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-2 font-medium">Descripción</th>
                <th className="w-24 px-2 py-2 font-medium">Cantidad</th>
                <th className="w-32 px-2 py-2 font-medium">
                  {tipo.preciosConIva ? "Precio (con IVA)" : "Precio neto"}
                </th>
                {tipo.afecto && (
                  <th className="w-20 px-2 py-2 text-center font-medium">Exenta</th>
                )}
                <th className="w-32 px-2 py-2 text-right font-medium">Monto</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => {
                const calc = calculo.lineas.find(
                  (l) => l.descripcion === fila.descripcion
                );
                return (
                  <tr key={fila.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-1.5">
                      <input type="hidden" name="linea_exenta" value={fila.exenta ? "si" : "no"} />
                      <Input
                        name="linea_descripcion"
                        value={fila.descripcion}
                        onChange={(e) => actualizar(fila.id, { descripcion: e.target.value })}
                        placeholder="500 tarjetas de presentación"
                        aria-label={`Descripción de la línea ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        name="linea_cantidad"
                        value={fila.cantidad}
                        onChange={(e) => actualizar(fila.id, { cantidad: e.target.value })}
                        inputMode="decimal"
                        aria-label={`Cantidad de la línea ${i + 1}`}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input
                        name="linea_precio"
                        value={fila.precio}
                        onChange={(e) => actualizar(fila.id, { precio: e.target.value })}
                        inputMode="numeric"
                        placeholder="10000"
                        aria-label={`Precio de la línea ${i + 1}`}
                      />
                    </td>
                    {tipo.afecto && (
                      <td className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={fila.exenta}
                          onChange={(e) => actualizar(fila.id, { exenta: e.target.checked })}
                          aria-label={`La línea ${i + 1} está exenta de IVA`}
                          className="size-4"
                        />
                      </td>
                    )}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {calc ? formatMonto(calc.totalLinea, region) : "—"}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        type="button"
                        onClick={() => quitar(fila.id)}
                        disabled={filas.length === 1}
                        aria-label={`Quitar la línea ${i + 1}`}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-30"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Los totales se calculan con la MISMA función del servidor */}
      <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <Fila label="Neto" valor={formatMonto(calculo.montos.neto, region)} />
        {calculo.montos.exento > 0 && (
          <Fila label="Exento" valor={formatMonto(calculo.montos.exento, region)} />
        )}
        {tipo.afecto && (
          <Fila label="IVA (19%)" valor={formatMonto(calculo.montos.iva, region)} />
        )}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-2 font-semibold">
          <span>Total</span>
          <span className="tabular-nums">
            {formatMonto(calculo.montos.total, region)}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="doc-obs">Observaciones</Label>
        <Textarea id="doc-obs" name="observaciones" rows={2} />
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || calculo.montos.total <= 0}>
          {pending ? "Guardando…" : "Guardar borrador"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Queda como borrador. Cuando lo emitas en el SII, vuelves y anotas el
          folio.
        </p>
      </div>
    </form>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  );
}

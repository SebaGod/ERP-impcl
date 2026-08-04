"use client";

import { useActionState, useState, useTransition } from "react";
import { BadgeCheck, FileMinus2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { esInmutable, type EstadoDte } from "@/lib/dte/tipos";
import {
  anularConNotaCredito,
  eliminarBorrador,
  registrarEmision,
  type EstadoAccion,
} from "../actions";

/**
 * Lo que se puede hacer con un documento, según dónde esté.
 *
 * Los tres caminos son excluyentes a propósito: mientras es borrador se
 * edita o se elimina; una vez emitido solo se anula con nota de crédito;
 * anulado ya no se toca. Ofrecer las tres cosas siempre y que el servidor
 * rechace dos sería enseñarle al usuario a apretar botones que fallan.
 */

const inicial: EstadoAccion = { error: null };

interface Props {
  dteId: string;
  estado: EstadoDte;
  /** Una nota de crédito no se anula con otra nota */
  esNota: boolean;
  /** "Boleta", "Factura"… para hablarle al usuario en su idioma */
  tipoCorto: string;
}

export function AccionesDocumento({ dteId, estado, esNota, tipoCorto }: Props) {
  const nombre = tipoCorto.toLowerCase();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Acciones</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {estado === "borrador" && <Borrador dteId={dteId} nombre={nombre} />}

        {esInmutable(estado) && estado !== "anulado" && (
          <Emitido dteId={dteId} nombre={nombre} esNota={esNota} />
        )}

        {estado === "anulado" && (
          <p className="text-sm text-muted-foreground">
            Esta {nombre} quedó sin efecto con una nota de crédito. Sigue en el
            registro porque el SII la recibió: no se borra, se muestra anulada.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Borrador: se le pone el folio o se elimina */
function Borrador({ dteId, nombre }: { dteId: string; nombre: string }) {
  const [state, formAction, pending] = useActionState(
    registrarEmision.bind(null, dteId),
    inicial
  );
  const [confirmando, setConfirmando] = useState(false);
  const [errorBorrar, setErrorBorrar] = useState<string | null>(null);
  const [borrando, startBorrar] = useTransition();

  return (
    <>
      <form action={formAction} className="flex flex-col gap-2">
        <Label htmlFor="folio">Folio que le asignó el SII</Label>
        <Input
          id="folio"
          name="folio"
          inputMode="numeric"
          placeholder="1234"
          autoComplete="off"
          required
        />
        <p className="text-xs text-muted-foreground">
          Emite la {nombre} en el portal del SII (o donde la emitas) y anota
          acá el número que quedó. Desde ese momento el documento no se edita
          más: corregirlo es hacer una nota de crédito.
        </p>

        {state.error && <p className="text-sm text-destructive">{state.error}</p>}

        <Button type="submit" disabled={pending} className="mt-1">
          <BadgeCheck className="size-4" />
          {pending ? "Registrando…" : "Registrar como emitida"}
        </Button>
      </form>

      <div className="border-t border-border pt-3">
        {confirmando ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              ¿Eliminar este borrador? No se puede recuperar.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="sm"
                disabled={borrando}
                onClick={() =>
                  startBorrar(async () => {
                    setErrorBorrar(null);
                    // Solo vuelve si algo falló: cuando borra, redirige.
                    const result = await eliminarBorrador(dteId);
                    if (result?.error) setErrorBorrar(result.error);
                  })
                }
              >
                {borrando ? "Eliminando…" : "Sí, eliminar"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={borrando}
                onClick={() => setConfirmando(false)}
              >
                <X className="size-4" /> Cancelar
              </Button>
            </div>
            {errorBorrar && (
              <p className="text-sm text-destructive">{errorBorrar}</p>
            )}
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirmando(true)}
            className="text-destructive"
          >
            <Trash2 className="size-4" /> Eliminar borrador
          </Button>
        )}
      </div>
    </>
  );
}

/** Emitido: lo único que queda es anularlo con una nota de crédito */
function Emitido({
  dteId,
  nombre,
  esNota,
}: {
  dteId: string;
  nombre: string;
  esNota: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    anularConNotaCredito.bind(null, dteId),
    inicial
  );
  const [abierto, setAbierto] = useState(false);

  if (esNota) {
    return (
      <p className="text-sm text-muted-foreground">
        Esta nota ya está registrada. Una nota no se anula con otra nota: si
        quedó mal, se emite el documento que corresponda.
      </p>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Esta {nombre} ya está emitida, así que no se edita ni se elimina. Para
        dejarla sin efecto hay que emitir una nota de crédito que la
        referencie.
      </p>

      {abierto ? (
        <form action={formAction} className="flex flex-col gap-2">
          <Label htmlFor="razon">¿Por qué se anula?</Label>
          <Textarea
            id="razon"
            name="razon"
            rows={2}
            required
            placeholder="Se anula por error en el monto"
          />
          <p className="text-xs text-muted-foreground">
            Queda escrito en la nota: el SII lo pide y es lo que va a leer tu
            contador dentro de seis meses.
          </p>

          {state.error && (
            <p className="text-sm text-destructive">{state.error}</p>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Creando…" : "Crear nota de crédito"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setAbierto(false)}
            >
              Cancelar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            La nota nace como borrador con los mismos montos. La {nombre} queda
            anulada cuando le pongas el folio de la nota.
          </p>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setAbierto(true)}>
          <FileMinus2 className="size-4" /> Anular con nota de crédito
        </Button>
      )}
    </>
  );
}

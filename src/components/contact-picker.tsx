"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  buscarContactosPicker,
  type ContactoElegible,
} from "./contact-picker-actions";

/**
 * Selector de contacto con búsqueda en el servidor.
 *
 * Reemplaza a los <select> que cargaban la tabla completa: con un CRM
 * real eso son decenas de miles de <option>. Aquí se escribe, el servidor
 * busca (nombre, correo, empresa o teléfono como sea que esté escrito) y
 * se elige entre a lo más 20 resultados.
 *
 * El valor elegido viaja en un input oculto con el `name` recibido, así
 * los formularios existentes no cambian su server action.
 */
export function ContactPicker({
  name = "contact_id",
  requerido = true,
}: {
  name?: string;
  requerido?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<ContactoElegible[]>([]);
  const [elegido, setElegido] = useState<ContactoElegible | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [fallo, setFallo] = useState(false);

  const contenedor = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Descarta respuestas que llegan tarde: si se teclea "mar" y luego
  // "maria", la respuesta de "mar" puede llegar después y pisar la buena.
  const consultaVigente = useRef(0);

  useEffect(() => {
    if (!abierto) return;
    function alHacerClic(e: MouseEvent) {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }
    function alPresionar(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    document.addEventListener("mousedown", alHacerClic);
    document.addEventListener("keydown", alPresionar);
    return () => {
      document.removeEventListener("mousedown", alHacerClic);
      document.removeEventListener("keydown", alPresionar);
    };
  }, [abierto]);

  useEffect(
    () => () => {
      if (debounce.current) clearTimeout(debounce.current);
    },
    []
  );

  async function buscar(texto: string) {
    const numero = ++consultaVigente.current;
    setBuscando(true);
    setFallo(false);
    const res = await buscarContactosPicker(texto);
    if (numero !== consultaVigente.current) return;
    setBuscando(false);
    if (!res.ok) {
      setFallo(true);
      setResultados([]);
      return;
    }
    setResultados(res.contactos);
  }

  function alEscribir(texto: string) {
    setQuery(texto);
    setAbierto(true);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void buscar(texto), 300);
  }

  function alEnfocar() {
    setAbierto(true);
    // Sin texto se muestran los más recientes: el contacto recién creado
    // es con quien más probablemente se quiere trabajar.
    if (resultados.length === 0 && !buscando) void buscar(query);
  }

  function elegir(c: ContactoElegible) {
    setElegido(c);
    setAbierto(false);
  }

  function quitar() {
    setElegido(null);
    setQuery("");
    setResultados([]);
  }

  if (elegido) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
        <input type="hidden" name={name} value={elegido.id} />
        <div className="flex min-w-0 items-center gap-2">
          <Check className="size-4 shrink-0 text-success" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{elegido.name}</p>
            {(elegido.phone || elegido.email) && (
              <p className="truncate text-xs text-muted-foreground">
                {elegido.phone ?? elegido.email}
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={quitar}
          aria-label="Cambiar contacto"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative" ref={contenedor}>
      {/* El oculto queda vacío hasta elegir: el server action ya valida que
          contact_id venga, así que el envío sin contacto se rechaza igual. */}
      <input type="hidden" name={name} value="" required={requerido} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => alEscribir(e.target.value)}
          onFocus={alEnfocar}
          placeholder="Buscar por nombre, correo o teléfono…"
          className="pl-8"
          aria-label="Buscar contacto"
          aria-expanded={abierto}
          role="combobox"
        />
        {buscando && (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {abierto && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {fallo ? (
            <p className="px-3 py-4 text-sm text-destructive">
              No pudimos buscar. Intenta de nuevo.
            </p>
          ) : resultados.length === 0 && !buscando ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">
              {query.trim()
                ? "Ningún contacto coincide."
                : "Escribe para buscar entre tus contactos."}
            </p>
          ) : (
            resultados.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => elegir(c)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm",
                  "transition-colors hover:bg-muted"
                )}
              >
                <span className="w-full truncate font-medium">{c.name}</span>
                {(c.phone || c.email) && (
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {c.phone ?? c.email}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

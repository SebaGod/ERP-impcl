"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bot, Inbox, Plus, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { channelLabels, type Channel } from "./channels";

export interface InboxItem {
  id: string;
  canal: string;
  estado: "abierta" | "cerrada";
  aiEnabled: boolean;
  contacto: string;
  ultimoMensaje: string | null;
  ultimoAutor: "contacto" | "usuario" | "agente_ia" | null;
  lastMessageAt: string | null;
}

const channelColors: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E1306C",
  messenger: "#0084FF",
  web: "#64748b",
  telefono: "#0891b2",
  email: "#d97706",
};

const DAY_MS = 86_400_000;

/** Hora relativa en español de Chile, función pura sin dependencias. */
function tiempoRelativo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "ahora";
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return horas === 1 ? "hace 1 hora" : `hace ${horas} horas`;
  const dias = Math.floor(diff / DAY_MS);
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  if (meses < 12) return meses === 1 ? "hace 1 mes" : `hace ${meses} meses`;
  const anios = Math.floor(dias / 365);
  return anios === 1 ? "hace 1 año" : `hace ${anios} años`;
}

function autorPrefijo(autor: InboxItem["ultimoAutor"]): string {
  if (autor === "usuario") return "Tú: ";
  if (autor === "agente_ia") return "IA: ";
  return "";
}

/** Timestamp mínimo según el filtro de fecha. Se calcula al cambiar el filtro. */
function calcularDesde(valor: string): number | null {
  if (valor === "hoy") {
    const inicio = new Date();
    inicio.setHours(0, 0, 0, 0);
    return inicio.getTime();
  }
  if (valor === "7") return Date.now() - 7 * DAY_MS;
  if (valor === "30") return Date.now() - 30 * DAY_MS;
  return null;
}

export function InboxList({ items }: { items: InboxItem[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("todas");
  const [canal, setCanal] = useState("todos");
  const [atencion, setAtencion] = useState("todas");
  const [fecha, setFecha] = useState("todo");
  const [desde, setDesde] = useState<number | null>(null);

  const cambiarFecha = (valor: string) => {
    setFecha(valor);
    setDesde(calcularDesde(valor));
  };

  const hayFiltros =
    busqueda.trim() !== "" ||
    estado !== "todas" ||
    canal !== "todos" ||
    atencion !== "todas" ||
    fecha !== "todo";

  const limpiar = () => {
    setBusqueda("");
    setEstado("todas");
    setCanal("todos");
    setAtencion("todas");
    setFecha("todo");
    setDesde(null);
  };

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();

    return items
      .filter((item) => {
        if (estado !== "todas" && item.estado !== estado) return false;
        if (canal !== "todos" && item.canal !== canal) return false;
        if (atencion === "ia" && !item.aiEnabled) return false;
        if (atencion === "humano" && item.aiEnabled) return false;
        if (desde !== null) {
          if (!item.lastMessageAt) return false;
          if (new Date(item.lastMessageAt).getTime() < desde) return false;
        }
        if (q !== "") {
          const enNombre = item.contacto.toLowerCase().includes(q);
          const enMensaje = (item.ultimoMensaje ?? "")
            .toLowerCase()
            .includes(q);
          if (!enNombre && !enMensaje) return false;
        }
        return true;
      })
      .sort((a, b) =>
        (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "")
      );
  }, [items, busqueda, estado, canal, atencion, desde]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Tu bandeja de conversaciones"
        description="Aquí se centralizan los mensajes de todos tus canales. Por ahora puedes crear conversaciones manuales y probar el agente; al conectar Meta entrarán los reales."
        action={
          <Link
            href="/conversaciones/nueva"
            className={buttonClasses("primary", "md")}
          >
            <Plus className="size-4" /> Nueva conversación
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por contacto o mensaje…"
          aria-label="Buscar conversaciones"
          className="w-full min-w-48 sm:w-auto sm:flex-1"
        />
        <Select
          value={estado}
          onChange={(e) => setEstado(e.target.value)}
          aria-label="Filtrar por estado"
          className="w-auto"
        >
          <option value="todas">Todas</option>
          <option value="abierta">Abiertas</option>
          <option value="cerrada">Cerradas</option>
        </Select>
        <Select
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          aria-label="Filtrar por canal"
          className="w-auto"
        >
          <option value="todos">Todos los canales</option>
          {(Object.keys(channelLabels) as Channel[]).map((key) => (
            <option key={key} value={key}>
              {channelLabels[key]}
            </option>
          ))}
        </Select>
        <Select
          value={atencion}
          onChange={(e) => setAtencion(e.target.value)}
          aria-label="Filtrar por atención"
          className="w-auto"
        >
          <option value="todas">Toda atención</option>
          <option value="ia">Atiende IA</option>
          <option value="humano">Atiende humano</option>
        </Select>
        <Select
          value={fecha}
          onChange={(e) => cambiarFecha(e.target.value)}
          aria-label="Filtrar por fecha"
          className="w-auto"
        >
          <option value="hoy">Hoy</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="todo">Todo</option>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {filtrados.length}{" "}
          {filtrados.length === 1 ? "resultado" : "resultados"}
        </span>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiar}>
            Limpiar
          </Button>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-12 text-center">
          <SearchX className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            Sin resultados con los filtros aplicados
          </p>
          <p className="text-sm text-muted-foreground">
            Ajusta la búsqueda o limpia los filtros para ver todas las
            conversaciones.
          </p>
          <Button variant="secondary" size="sm" onClick={limpiar}>
            Limpiar filtros
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          {filtrados.map((item) => {
            const color = channelColors[item.canal] ?? "#64748b";
            const sinLeer = item.ultimoAutor === "contacto";
            return (
              <li key={item.id}>
                <Link
                  href={`/conversaciones/${item.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-muted/50"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 shrink-0 rounded-full",
                      sinLeer ? "bg-blue-500" : "bg-transparent"
                    )}
                  />
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium uppercase text-muted-foreground">
                    {item.contacto.trim().charAt(0) || "?"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">
                        {item.contacto}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${color}1a`, color }}
                      >
                        {channelLabels[item.canal as Channel] ?? item.canal}
                      </span>
                      {item.aiEnabled && (
                        <Badge
                          variant="default"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          <Bot className="mr-1 size-3" /> IA
                        </Badge>
                      )}
                      {item.estado === "cerrada" && (
                        <Badge variant="outline">Cerrada</Badge>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                      {item.ultimoMensaje
                        ? `${autorPrefijo(item.ultimoAutor)}${item.ultimoMensaje}`
                        : "Sin mensajes todavía"}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-xs text-muted-foreground tabular-nums"
                    suppressHydrationWarning
                  >
                    {tiempoRelativo(item.lastMessageAt)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

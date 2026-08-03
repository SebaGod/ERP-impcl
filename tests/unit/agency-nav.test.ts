import { describe, expect, it } from "vitest";
import { agencyNav, itemActivo, type AgencyNavItem } from "@/components/agency-shell/nav";

const todos: AgencyNavItem[] = agencyNav.flatMap((s) => s.items);

function buscar(href: string): AgencyNavItem {
  const item = todos.find((i) => i.href === href);
  if (!item) throw new Error(`El menú no tiene ${href}`);
  return item;
}

describe("menú de la agencia", () => {
  it("no repite rutas entre secciones", () => {
    const hrefs = todos.map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("todas las rutas cuelgan de /agencia", () => {
    for (const item of todos) {
      expect(item.href.startsWith("/agencia")).toBe(true);
    }
  });

  it("la primera sección no lleva encabezado y las demás sí", () => {
    expect(agencyNav[0]!.label).toBeNull();
    for (const seccion of agencyNav.slice(1)) {
      expect(seccion.label).toBeTruthy();
    }
  });
});

describe("itemActivo", () => {
  it("la raíz solo se activa con coincidencia exacta", () => {
    // Sin `exact`, /agencia quedaría encendido en todas las pantallas:
    // es prefijo de cualquier otra ruta del panel.
    const tablero = buscar("/agencia");
    expect(itemActivo(tablero, "/agencia")).toBe(true);
    expect(itemActivo(tablero, "/agencia/canales")).toBe(false);
    expect(itemActivo(tablero, "/agencia/subcuentas/abc")).toBe(false);
  });

  it("una sección se mantiene activa en sus subrutas", () => {
    const subcuentas = buscar("/agencia/subcuentas");
    expect(itemActivo(subcuentas, "/agencia/subcuentas")).toBe(true);
    expect(itemActivo(subcuentas, "/agencia/subcuentas/8f2a-uuid")).toBe(true);
  });

  it("no confunde rutas que comparten prefijo de texto", () => {
    // /agencia/consola no debe encenderse en /agencia/consolidado:
    // por eso la comparación exige la barra, no un startsWith pelado.
    const consola = buscar("/agencia/consola");
    expect(itemActivo(consola, "/agencia/consolidado")).toBe(false);
    expect(itemActivo(consola, "/agencia/consola/agentes")).toBe(true);
  });

  it("exactamente un ítem queda activo en cada ruta del menú", () => {
    for (const item of todos) {
      const activos = todos.filter((i) => itemActivo(i, item.href));
      expect(activos.map((a) => a.href)).toEqual([item.href]);
    }
  });
});

import { describe, expect, it } from "vitest";
import { isPublicPath } from "@/lib/supabase/middleware";

/**
 * Qué rutas se atienden sin sesión.
 *
 * Este archivo existe por un error real: el webhook de Meta quedó fuera de
 * la lista y el middleware lo redirigía al login con un 307. Meta nunca
 * llegaba a nuestro código, así que no había error que registrar, ni
 * excepción, ni nada raro en la consola. Todo se veía sano y no llegaba un
 * solo mensaje. Solo apareció al golpear la URL ya desplegada.
 *
 * La lista tiene dos mitades opuestas y las dos importan: lo que Meta llama
 * tiene que entrar sin sesión, y lo que conecta cuentas NO puede.
 */

describe("rutas que Meta llama y deben pasar sin sesión", () => {
  // Sin cookie que mandar: las llama un servidor de Meta, no un navegador.
  const deMeta = [
    "/api/webhooks/meta",
    "/api/meta/data-deletion",
    "/api/meta/deauthorize",
  ];

  for (const ruta of deMeta) {
    it(`${ruta} es pública`, () => {
      expect(isPublicPath(ruta)).toBe(true);
    });
  }
});

describe("rutas que conectan cuentas y exigen sesión", () => {
  // Estas las dispara un administrador desde el panel. Abrirlas dejaría a
  // cualquiera enlazando la página de Facebook de otra empresa.
  const conSesion = [
    "/api/meta/oauth/start",
    "/api/meta/oauth/callback",
    "/api/meta/embedded-signup",
  ];

  for (const ruta of conSesion) {
    it(`${ruta} NO es pública`, () => {
      expect(isPublicPath(ruta)).toBe(false);
    });
  }
});

describe("el resto de la aplicación sigue protegido", () => {
  const privadas = [
    "/",
    "/dashboard",
    "/contactos",
    "/conversaciones/abc",
    "/configuracion/integraciones",
    "/agencia",
    "/agencia/consola/agentes",
    "/api",
    "/api/otra-cosa",
  ];

  for (const ruta of privadas) {
    it(`${ruta} exige sesión`, () => {
      expect(isPublicPath(ruta)).toBe(false);
    });
  }

  it("no basta con que la ruta EMPIECE con el nombre de una pública", () => {
    // /privacidad es pública; /privacidad-interna no tiene por qué serlo.
    expect(isPublicPath("/privacidad")).toBe(true);
    expect(isPublicPath("/privacidad-interna")).toBe(false);
    expect(isPublicPath("/loginfalso")).toBe(false);
    expect(isPublicPath("/api/webhooks/meta-falso")).toBe(false);
  });

  it("las públicas de verdad aceptan subrutas", () => {
    expect(isPublicPath("/invitacion/un-token")).toBe(true);
    expect(isPublicPath("/cotizacion/otro-token")).toBe(true);
  });
});

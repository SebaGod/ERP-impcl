import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RUTA_WEBHOOK_META } from "@/lib/channels/meta";

/**
 * La configuración de la agencia enciende una luz verde cuando el servidor
 * está listo para recibir mensajes de Meta. Esa luz depende de dos cosas:
 * las variables de entorno y una dirección HTTP publicada a la que Meta
 * pueda llamar.
 *
 * La dirección se declara en una constante, y una constante puede quedar
 * desincronizada del código real en cualquiera de los dos sentidos: alguien
 * la apunta a una ruta que no existe (luz verde y no llega nada), o crea la
 * ruta y olvida apuntarla (luz roja con todo funcionando). Las dos versiones
 * le mienten a quien mira el panel, así que las dos fallan acá.
 */
function rutaEnDisco(ruta: string): string {
  const relativa = ruta.replace(/^\//, "");
  return fileURLToPath(new URL(`../../src/app/${relativa}/route.ts`, import.meta.url));
}

const RUTA_ESPERADA = "/api/webhooks/meta";

describe("la ruta del webhook de Meta no puede mentir", () => {
  it("si está declarada, el archivo de la ruta existe", () => {
    if (RUTA_WEBHOOK_META === null) return;
    expect(
      existsSync(rutaEnDisco(RUTA_WEBHOOK_META)),
      `RUTA_WEBHOOK_META apunta a ${RUTA_WEBHOOK_META} pero no hay route.ts ahí: el panel diría que recibe mensajes y no llegaría ninguno`
    ).toBe(true);
  });

  it("si el archivo de la ruta existe, está declarada", () => {
    if (!existsSync(rutaEnDisco(RUTA_ESPERADA))) return;
    expect(
      RUTA_WEBHOOK_META,
      `existe ${RUTA_ESPERADA}/route.ts pero RUTA_WEBHOOK_META sigue en null: el panel diría que falta desarrollo cuando ya está hecho`
    ).not.toBeNull();
  });
});

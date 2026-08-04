import { describe, expect, it } from "vitest";
import { exigirLectura } from "@/lib/lectura";

/**
 * "No existe" y "no se pudo leer" tienen que seguir siendo distintos.
 *
 * Las doce pantallas de detalle desestructuraban solo `data`, así que
 * una consulta caída y un registro inexistente llegaban al mismo `if`
 * siendo ambos null, y la pantalla afirmaba lo que no sabía.
 *
 * La diferencia no es de estilo. En /documentos/[id] termina en una
 * factura emitida dos veces: la pantalla dice que no existe, quien la
 * mira la vuelve a emitir, y deshacerlo exige una nota de crédito.
 */

describe("un registro que no está", () => {
  it("devuelve null, para que la pantalla muestre su 404", () => {
    expect(exigirLectura({ data: null, error: null }, "la factura")).toBeNull();
  });

  it("no confunde datos falsy con ausencia", () => {
    // Un 0 o un string vacío son datos: solo null significa "no está".
    expect(exigirLectura({ data: 0, error: null }, "el saldo")).toBe(0);
    expect(exigirLectura({ data: "", error: null }, "la nota")).toBe("");
    expect(exigirLectura({ data: false, error: null }, "el flag")).toBe(false);
  });

  it("devuelve el registro tal cual cuando está", () => {
    const factura = { id: "abc", folio: 41 };
    expect(exigirLectura({ data: factura, error: null }, "la factura")).toBe(
      factura
    );
  });
});

describe("una lectura que falló", () => {
  it("lanza en vez de hacerse pasar por ausencia", () => {
    expect(() =>
      exigirLectura(
        { data: null, error: { message: "connection reset" } },
        "la factura"
      )
    ).toThrow();
  });

  it("nombra qué se estaba leyendo y por qué falló", () => {
    // Este texto va al log del servidor y a la bitácora, no al navegador:
    // en producción Next reemplaza el mensaje por uno genérico antes de
    // mandarlo al cliente.
    expect(() =>
      exigirLectura(
        { data: null, error: { message: "connection reset" } },
        "la factura"
      )
    ).toThrow(/la factura.*connection reset/);
  });

  it("lanza aunque venga un dato junto al error", () => {
    // Postgrest puede devolver filas parciales con error. Confiar en ese
    // dato es exactamente lo que produce una pantalla incompleta que se
    // ve completa.
    expect(() =>
      exigirLectura(
        { data: { id: "abc" }, error: { message: "statement timeout" } },
        "la factura"
      )
    ).toThrow(/statement timeout/);
  });
});

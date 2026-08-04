import { describe, expect, it } from "vitest";
import {
  brutoDesdeNeto,
  calcularDte,
  montosCuadran,
  montosParaAnular,
  netoDesdeBruto,
  TASA_IVA,
  type LineaDte,
} from "@/lib/dte/montos";
import { TIPOS_DTE } from "@/lib/dte/tipos";
import { totalesLibro } from "@/lib/dte/queries";

/**
 * El cálculo tributario, probado en serio.
 *
 * Un peso de diferencia entre lo que declara el documento y lo que suma
 * el SII es un documento rechazado, y el folio se pierde. Acá no hay
 * "más o menos": cada aserción es un número exacto.
 */

describe("boleta: los precios ya incluyen IVA", () => {
  it("un producto de $10.000 se declara con el neto correcto", () => {
    // Lo que ve el cliente y paga son $10.000. El neto es lo que queda
    // sacándole el IVA, y el IVA sale por diferencia para que sumen justo.
    const { montos } = calcularDte(39, [
      { descripcion: "Impresión", cantidad: 1, precioUnitario: 10_000 },
    ]);

    expect(montos.neto).toBe(8_403);
    expect(montos.iva).toBe(1_597);
    expect(montos.total).toBe(10_000);
  });

  it("el total NUNCA se aleja del precio publicado", () => {
    // El error clásico: calcular el IVA aparte y que el total dé $10.001.
    // El cliente pagó $10.000 y el documento tiene que decir $10.000.
    for (let precio = 1; precio <= 3_000; precio++) {
      const { montos } = calcularDte(39, [
        { descripcion: "x", cantidad: 1, precioUnitario: precio },
      ]);
      expect(montos.total, `precio ${precio}`).toBe(precio);
    }
  });

  it("tratar el precio de boleta como neto habría inflado el IVA", () => {
    // Este es el error caro del rubro: si los $10.000 se tomaran como
    // neto, se declararía $1.900 de IVA que el cliente nunca cobró.
    const boleta = calcularDte(39, [
      { descripcion: "x", cantidad: 1, precioUnitario: 10_000 },
    ]);
    const factura = calcularDte(33, [
      { descripcion: "x", cantidad: 1, precioUnitario: 10_000 },
    ]);

    expect(boleta.montos.iva).toBe(1_597);
    expect(factura.montos.iva).toBe(1_900);
    // 303 pesos por cada diez mil, que salen del bolsillo del cliente
    expect(factura.montos.iva - boleta.montos.iva).toBe(303);
  });
});

describe("factura: los precios son netos", () => {
  it("suma el IVA sobre el neto", () => {
    const { montos } = calcularDte(33, [
      { descripcion: "Pendón", cantidad: 2, precioUnitario: 25_000 },
    ]);

    expect(montos.neto).toBe(50_000);
    expect(montos.iva).toBe(9_500);
    expect(montos.total).toBe(59_500);
  });

  it("el IVA se calcula sobre el neto TOTAL, no línea por línea", () => {
    // Tres líneas cuyo IVA individual redondea distinto que el del total.
    // El SII calcula sobre el total; hacerlo por línea da otro número.
    const lineas: LineaDte[] = [
      { descripcion: "a", cantidad: 1, precioUnitario: 333 },
      { descripcion: "b", cantidad: 1, precioUnitario: 333 },
      { descripcion: "c", cantidad: 1, precioUnitario: 333 },
    ];
    const { montos } = calcularDte(33, lineas);

    const ivaPorLinea = lineas.reduce(
      (suma, l) => suma + Math.round(l.precioUnitario * TASA_IVA),
      0
    );

    expect(montos.neto).toBe(999);
    expect(montos.iva).toBe(190); // round(999 * 0,19) = 189,81 → 190
    expect(ivaPorLinea).toBe(189); // sumando por línea daría 189
    expect(montos.iva).not.toBe(ivaPorLinea);
  });

  it("las cantidades con decimales dan montos enteros", () => {
    // 2,5 kg a $1.333: el monto de la línea no puede quedar con centavos
    const { lineas, montos } = calcularDte(33, [
      { descripcion: "Papel", cantidad: 2.5, precioUnitario: 1_333 },
    ]);

    expect(Number.isInteger(lineas[0]!.netoLinea)).toBe(true);
    expect(lineas[0]!.netoLinea).toBe(3_333); // round(3332,5)
    expect(Number.isInteger(montos.iva)).toBe(true);
    expect(montos.total).toBe(3_333 + 633);
  });
});

describe("líneas exentas", () => {
  it("una factura puede mezclar afecto y exento", () => {
    const { montos } = calcularDte(33, [
      { descripcion: "Impresión", cantidad: 1, precioUnitario: 100_000 },
      { descripcion: "Flete exento", cantidad: 1, precioUnitario: 20_000, exenta: true },
    ]);

    expect(montos.neto).toBe(100_000);
    expect(montos.exento).toBe(20_000);
    // El IVA NO toca la parte exenta
    expect(montos.iva).toBe(19_000);
    expect(montos.total).toBe(139_000);
  });

  it("una factura exenta no lleva IVA aunque las líneas no lo digan", () => {
    const { montos } = calcularDte(34, [
      { descripcion: "Servicio exento", cantidad: 1, precioUnitario: 50_000 },
    ]);

    expect(montos.iva).toBe(0);
    expect(montos.total).toBe(50_000);
  });

  it("en una boleta exenta el precio NO se divide por 1,19", () => {
    // Sin IVA que sacar, el precio escrito ES el monto. Dividirlo igual
    // le quitaría al cliente un 16% de lo que cobró.
    const { montos } = calcularDte(41, [
      { descripcion: "x", cantidad: 1, precioUnitario: 10_000 },
    ]);

    expect(montos.total).toBe(10_000);
    expect(montos.iva).toBe(0);
  });
});

describe("descuentos", () => {
  it("el descuento baja la base imponible, no solo el total", () => {
    const { montos } = calcularDte(33, [
      { descripcion: "x", cantidad: 1, precioUnitario: 100_000, descuento: 10_000 },
    ]);

    expect(montos.neto).toBe(90_000);
    expect(montos.iva).toBe(17_100);
    expect(montos.total).toBe(107_100);
  });

  it("un descuento mayor que la línea no produce montos negativos", () => {
    const { montos } = calcularDte(33, [
      { descripcion: "x", cantidad: 1, precioUnitario: 1_000, descuento: 5_000 },
    ]);

    expect(montos.neto).toBe(0);
    expect(montos.total).toBe(0);
  });
});

describe("invariantes que el SII revisa", () => {
  it("todos los montos son enteros, siempre", () => {
    const casos: [number, number][] = [
      [1, 1], [3, 7], [2.5, 1_333], [1, 999_999], [7, 12_345], [0.5, 101],
    ];
    for (const codigo of [33, 34, 39, 41] as const) {
      for (const [cantidad, precio] of casos) {
        const { montos } = calcularDte(codigo, [
          { descripcion: "x", cantidad, precioUnitario: precio },
        ]);
        for (const [nombre, valor] of Object.entries(montos)) {
          expect(
            Number.isInteger(valor),
            `${codigo} · ${cantidad}×${precio} · ${nombre}=${valor}`
          ).toBe(true);
        }
      }
    }
  });

  it("total = neto + exento + IVA en todos los casos", () => {
    for (const codigo of [33, 34, 39, 41] as const) {
      for (let precio = 1; precio <= 500; precio++) {
        const { montos } = calcularDte(codigo, [
          { descripcion: "a", cantidad: 3, precioUnitario: precio },
          { descripcion: "b", cantidad: 1, precioUnitario: precio, exenta: true },
        ]);
        expect(montosCuadran(montos), `${codigo} precio ${precio}`).toBe(true);
      }
    }
  });

  it("un documento sin líneas da todo en cero, no NaN", () => {
    const { montos } = calcularDte(33, []);
    expect(montos).toEqual({ neto: 0, exento: 0, iva: 0, total: 0 });
    expect(montosCuadran(montos)).toBe(true);
  });
});

describe("netoDesdeBruto", () => {
  it("va y vuelve sin perder pesos", () => {
    for (let bruto = 1; bruto <= 5_000; bruto++) {
      const neto = netoDesdeBruto(bruto);
      const iva = bruto - neto;
      expect(neto + iva, `bruto ${bruto}`).toBe(bruto);
    }
  });
});

describe("nota de crédito que anula", () => {
  it("copia los montos exactos del original, no los recalcula", () => {
    // Si la tasa de IVA cambiara entre la factura y la nota, recalcular
    // dejaría una diferencia que nunca se cierra en la contabilidad.
    const original = { neto: 8_403, exento: 0, iva: 1_597, total: 10_000 };
    const nota = montosParaAnular(original);

    expect(nota).toEqual(original);
    expect(montosCuadran(nota)).toBe(true);
  });
});

describe("catálogo de tipos", () => {
  it("los códigos del SII son los correctos", () => {
    // No son una elección nuestra: escribirlos mal falla al emitir
    expect(TIPOS_DTE[33].nombre).toContain("Factura");
    expect(TIPOS_DTE[39].nombre).toContain("Boleta");
    expect(TIPOS_DTE[61].nombre).toContain("crédito");
  });

  it("solo las boletas traen los precios con IVA incluido", () => {
    for (const tipo of Object.values(TIPOS_DTE)) {
      const esBoleta = tipo.codigo === 39 || tipo.codigo === 41;
      expect(tipo.preciosConIva, tipo.nombre).toBe(esBoleta);
    }
  });

  it("solo las boletas permiten no identificar al receptor", () => {
    for (const tipo of Object.values(TIPOS_DTE)) {
      const esBoleta = tipo.codigo === 39 || tipo.codigo === 41;
      expect(tipo.exigeReceptor, tipo.nombre).toBe(!esBoleta);
    }
  });
});

describe("totales del libro de ventas", () => {
  it("las notas de crédito restan del total declarado", () => {
    // Es la cuenta que termina en la declaración: si una factura se anuló,
    // ese IVA no se entera.
    const totales = totalesLibro([
      { tipo: 33, documentos: 10, neto: 1_000_000, exento: 0, iva: 190_000, total: 1_190_000 },
      { tipo: 61, documentos: 1, neto: 100_000, exento: 0, iva: 19_000, total: 119_000 },
    ]);

    expect(totales.neto).toBe(900_000);
    expect(totales.iva).toBe(171_000);
    expect(totales.total).toBe(1_071_000);
  });

  it("muestra aparte cuánto se anuló, en vez de esconderlo en la resta", () => {
    // El contador necesita ver el monto anulado, no solo el neto final
    const totales = totalesLibro([
      { tipo: 33, documentos: 5, neto: 500_000, exento: 0, iva: 95_000, total: 595_000 },
      { tipo: 61, documentos: 2, neto: 50_000, exento: 0, iva: 9_500, total: 59_500 },
    ]);
    expect(totales.anulado).toBe(59_500);
    expect(totales.documentos).toBe(7);
  });

  it("la nota de débito suma, no resta", () => {
    const totales = totalesLibro([
      { tipo: 33, documentos: 1, neto: 100_000, exento: 0, iva: 19_000, total: 119_000 },
      { tipo: 56, documentos: 1, neto: 10_000, exento: 0, iva: 1_900, total: 11_900 },
    ]);
    expect(totales.neto).toBe(110_000);
  });

  it("un periodo sin documentos da cero, no NaN", () => {
    const totales = totalesLibro([]);
    expect(totales).toEqual({
      neto: 0, exento: 0, iva: 0, total: 0, documentos: 0, anulado: 0,
    });
  });

  it("suma boletas, facturas y exentas por separado sin mezclar", () => {
    const totales = totalesLibro([
      { tipo: 39, documentos: 20, neto: 168_067, exento: 0, iva: 31_933, total: 200_000 },
      { tipo: 33, documentos: 3, neto: 300_000, exento: 0, iva: 57_000, total: 357_000 },
      { tipo: 34, documentos: 1, neto: 0, exento: 50_000, iva: 0, total: 50_000 },
    ]);
    expect(totales.neto).toBe(468_067);
    expect(totales.exento).toBe(50_000);
    expect(totales.iva).toBe(88_933);
    expect(totales.total).toBe(607_000);
  });
});

describe("convertir precios netos a precios con IVA", () => {
  it("agrega el IVA al neto", () => {
    expect(brutoDesdeNeto(10_000)).toBe(11_900);
    expect(brutoDesdeNeto(1)).toBe(1);
    expect(brutoDesdeNeto(0)).toBe(0);
    expect(brutoDesdeNeto(84_034)).toBe(100_000);
  });

  it("vuelve al neto de origen o a un peso de distancia", () => {
    // En pesos enteros el ida y vuelta no es exacto: lo que importa es
    // que la diferencia sea de un peso y no de un 19%, que es lo que
    // pasaría si alguien se saltara la conversión.
    for (let neto = 1; neto <= 20_000; neto++) {
      const vuelta = netoDesdeBruto(brutoDesdeNeto(neto));
      expect(Math.abs(vuelta - neto)).toBeLessThanOrEqual(1);
    }
  });

  it("una cotización convertida a boleta cobra el mismo total", () => {
    // El caso que decide si el negocio regala el IVA: la cotización
    // guarda precios NETOS y la boleta los quiere con IVA incluido.
    const netas = [
      { descripcion: "Diseño", cantidad: 1, precioUnitario: 100_000 },
      { descripcion: "Impresión", cantidad: 2, precioUnitario: 25_000 },
    ];
    const brutoDeCotizacion = netas.reduce(
      (suma, l) => suma + l.cantidad * l.precioUnitario,
      0
    );
    const conIva = netas.map((l) => ({
      ...l,
      precioUnitario: brutoDesdeNeto(l.precioUnitario),
    }));

    const boleta = calcularDte(39, conIva);
    // El cliente paga el neto cotizado más su IVA, no el neto pelado
    expect(boleta.montos.total).toBe(Math.round(brutoDeCotizacion * 1.19));
    // Y adentro el documento cuadra: neto + IVA es exactamente lo cobrado
    expect(boleta.montos.neto + boleta.montos.iva).toBe(boleta.montos.total);
  });

  it("copiar los netos a una boleta sin convertir se lleva el IVA del negocio", () => {
    // Documenta el error que la conversión existe para evitar: los mismos
    // $150.000 netos, puestos crudos en una boleta, dejan $23.950 menos.
    const sinConvertir = calcularDte(39, [
      { descripcion: "Diseño", cantidad: 1, precioUnitario: 150_000 },
    ]);
    const convertido = calcularDte(39, [
      { descripcion: "Diseño", cantidad: 1, precioUnitario: brutoDesdeNeto(150_000) },
    ]);
    expect(sinConvertir.montos.total).toBe(150_000);
    expect(convertido.montos.total).toBe(178_500);
  });

  it("a una factura no se le convierte nada: ya son netos", () => {
    const factura = calcularDte(33, [
      { descripcion: "Servicio", cantidad: 1, precioUnitario: 100_000 },
    ]);
    expect(factura.montos.neto).toBe(100_000);
    expect(factura.montos.iva).toBe(19_000);
    expect(factura.montos.total).toBe(119_000);
  });
});

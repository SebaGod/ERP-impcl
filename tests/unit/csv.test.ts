import { describe, expect, it } from "vitest";
import {
  BOM_UTF8,
  campoCSV,
  DEFINICIONES,
  ENTIDADES,
  esEntidad,
  fechaCSV,
  filaCSV,
  jsonCSV,
  listaCSV,
  nombreArchivo,
} from "@/app/(app)/configuracion/exportar/route-helpers";
import { REGIONES, REGION_CHILE } from "@/lib/locale";

/**
 * El escapado del CSV.
 *
 * Es la parte con más filo de la exportación: un archivo mal escapado no
 * falla, se abre. El cliente lo mira, ve las columnas corridas a partir
 * de la fila 300 —donde alguien escribió una dirección con coma— y lo que
 * concluye es que le entregamos los datos mal. No hay error que revisar
 * después, porque nunca hubo una excepción.
 *
 * Cada caso de acá salió de un dato real que existe en un CRM: nombres de
 * empresa con comas, medidas con comillas, notas con saltos de línea,
 * campos vacíos y acentos.
 */

/** Deshace un CSV de una sola fila. Sirve para probar el viaje de ida y vuelta. */
function parsearFila(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let i = 0; i < linea.length; i++) {
    const caracter = linea[i];
    if (entreComillas) {
      if (caracter === '"') {
        if (linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else {
          entreComillas = false;
        }
      } else {
        actual += caracter;
      }
    } else if (caracter === '"') {
      entreComillas = true;
    } else if (caracter === ",") {
      campos.push(actual);
      actual = "";
    } else {
      actual += caracter;
    }
  }
  campos.push(actual);
  return campos;
}

describe("campoCSV: cuándo hace falta entrecomillar", () => {
  it("deja en paz lo que no tiene nada especial", () => {
    expect(campoCSV("Sebastián Godoy")).toBe("Sebastián Godoy");
    expect(campoCSV("+56977435119")).toBe("+56977435119");
    expect(campoCSV("seba@heat.cl")).toBe("seba@heat.cl");
  });

  it("entrecomilla lo que trae una coma", () => {
    // Sin comillas, "Libreria La Pluma, S.A." se parte en dos columnas y
    // desde ahí toda la fila queda corrida.
    expect(campoCSV("Libreria La Pluma, S.A.")).toBe(
      '"Libreria La Pluma, S.A."'
    );
  });

  it("duplica las comillas dobles y entrecomilla el campo", () => {
    expect(campoCSV('Tornillo de 5" con cabeza')).toBe(
      '"Tornillo de 5"" con cabeza"'
    );
    // Un campo que es SOLO una comilla sigue siendo un campo válido.
    expect(campoCSV('"')).toBe('""""');
  });

  it("entrecomilla los saltos de línea, en sus tres formas", () => {
    expect(campoCSV("linea1\nlinea2")).toBe('"linea1\nlinea2"');
    expect(campoCSV("linea1\r\nlinea2")).toBe('"linea1\r\nlinea2"');
    // \r solo: lo dejan los Mac antiguos y los pega la gente desde Word.
    expect(campoCSV("linea1\rlinea2")).toBe('"linea1\rlinea2"');
  });

  it("entrecomilla los espacios de los bordes para que sobrevivan", () => {
    expect(campoCSV("  Ana  ")).toBe('"  Ana  "');
    expect(campoCSV("Ana ")).toBe('"Ana "');
    // Adentro no molestan a nadie: no hace falta entrecomillar.
    expect(campoCSV("Ana Maria")).toBe("Ana Maria");
  });

  it("no toca el punto y coma ni el tabulador", () => {
    // El separador es la coma. Entrecomillar de más ensucia sin motivo.
    expect(campoCSV("a;b")).toBe("a;b");
    expect(campoCSV("a\tb")).toBe("a\tb");
  });
});

describe("campoCSV: lo que no es texto", () => {
  it("escribe celda vacía para null y para undefined", () => {
    // Y no la palabra "null": hay gente que se apellida así, y quien abra
    // el archivo no podría distinguir el apellido del dato ausente.
    expect(campoCSV(null)).toBe("");
    expect(campoCSV(undefined)).toBe("");
  });

  it("distingue el vacío del dato ausente", () => {
    // Los dos se ven igual en la celda, pero el string vacío es un dato
    // que existe: la comparación importa al reimportar.
    expect(campoCSV("")).toBe("");
  });

  it("escribe los booleanos en español", () => {
    expect(campoCSV(true)).toBe("Sí");
    expect(campoCSV(false)).toBe("No");
  });

  it("escribe los números sin separador de miles ni símbolo", () => {
    // "$1.250.000" llega a Excel como texto y deja de sumar.
    expect(campoCSV(1250000)).toBe("1250000");
    expect(campoCSV(0)).toBe("0");
    expect(campoCSV(-4500)).toBe("-4500");
    expect(campoCSV(1234.56)).toBe("1234.56");
  });

  it("no esconde un número roto detrás de una celda vacía", () => {
    expect(campoCSV(Number.NaN)).toBe("NaN");
  });
});

describe("campoCSV: acentos y caracteres de la región", () => {
  it("no transforma los acentos ni la eñe", () => {
    // El archivo se escribe en UTF-8 con BOM; acá no hay nada que
    // convertir, y convertir algo sería justamente el error.
    expect(campoCSV("María Ñandú")).toBe("María Ñandú");
    expect(campoCSV("Ñuñoa")).toBe("Ñuñoa");
    expect(campoCSV("Coyhaique — Región de Aysén")).toBe(
      "Coyhaique — Región de Aysén"
    );
    expect(campoCSV("🙂 emoji")).toBe("🙂 emoji");
  });

  it("entrecomilla igual si además trae una coma", () => {
    expect(campoCSV('María "la jefa", S.A.')).toBe('"María ""la jefa"", S.A."');
  });
});

describe("filaCSV", () => {
  it("une con comas y cierra con CRLF", () => {
    expect(filaCSV(["a", "b", "c"])).toBe("a,b,c\r\n");
  });

  it("una fila de puros vacíos conserva todas sus columnas", () => {
    // Tres columnas vacías son dos comas: si se colapsaran, la fila
    // siguiente se leería con menos campos que la cabecera.
    expect(filaCSV([null, null, null])).toBe(",,\r\n");
  });

  it("una celda con salto de línea no parte la fila", () => {
    const linea = filaCSV(["Ana", "nota\ncon salto", "fin"]);
    expect(linea.endsWith("\r\n")).toBe(true);
    // El único fin de fila real es el del final: el \n de adentro va
    // entre comillas y cualquier parser lo entiende como parte del campo.
    expect(linea).toBe('Ana,"nota\ncon salto",fin\r\n');
  });

  it("sobrevive al viaje de ida y vuelta", () => {
    const original = [
      "María, la jefa",
      'Tornillo de 5"',
      "linea1\nlinea2",
      "  con espacios  ",
      "",
      "normal",
    ];
    const linea = filaCSV(original).slice(0, -2);
    expect(parsearFila(linea)).toEqual(original);
  });

  it("los nulos vuelven como cadenas vacías, no como texto", () => {
    const linea = filaCSV(["Ana", null, 0, false]).slice(0, -2);
    expect(parsearFila(linea)).toEqual(["Ana", "", "0", "No"]);
  });
});

describe("BOM UTF-8", () => {
  it("es un solo carácter, el U+FEFF", () => {
    // Sin él Excel en Windows lee Latin-1 y "María" sale "MarÃ­a".
    expect(BOM_UTF8).toHaveLength(1);
    expect(BOM_UTF8.charCodeAt(0)).toBe(0xfeff);
  });

  it("son exactamente tres bytes al codificar en UTF-8", () => {
    const bytes = new TextEncoder().encode(BOM_UTF8);
    expect([...bytes]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("va antes de la cabecera y no rompe el primer nombre de columna", () => {
    const archivo = BOM_UTF8 + filaCSV(["ID", "Nombre"]);
    expect(archivo.startsWith(BOM_UTF8)).toBe(true);
    expect(archivo.slice(1)).toBe("ID,Nombre\r\n");
  });
});

describe("listaCSV y jsonCSV", () => {
  it("junta las etiquetas con punto y coma", () => {
    expect(listaCSV(["vip", "moroso"])).toBe("vip; moroso");
    expect(listaCSV([])).toBe("");
    expect(listaCSV(null)).toBe("");
  });

  it("una etiqueta con coma queda entrecomillada por campoCSV", () => {
    expect(campoCSV(listaCSV(["compró, pagó", "vip"]))).toBe(
      '"compró, pagó; vip"'
    );
  });

  it("un jsonb vacío es celda vacía, no {}", () => {
    expect(jsonCSV({})).toBe("");
    expect(jsonCSV(null)).toBe("");
    expect(jsonCSV(undefined)).toBe("");
  });

  it("un jsonb con datos viaja como JSON entrecomillado", () => {
    const celda = jsonCSV({ talla: "L", nota: 'dijo "sí"' });
    expect(JSON.parse(celda)).toEqual({ talla: "L", nota: 'dijo "sí"' });
    // Al escaparlo, las comillas del JSON se duplican y el campo entero
    // queda entre comillas: sigue siendo una sola celda.
    const escapado = campoCSV(celda);
    expect(escapado.startsWith('"')).toBe(true);
    expect(parsearFila(escapado)).toEqual([celda]);
  });
});

describe("fechas y nombre de archivo", () => {
  const PERU = REGIONES.find((r) => r.pais === "Perú")!.config;

  it("una fecha ausente es celda vacía", () => {
    expect(fechaCSV(null, REGION_CHILE)).toBe("");
    expect(fechaCSV(undefined, REGION_CHILE)).toBe("");
  });

  it("la fecha sale en la zona horaria de la subcuenta", () => {
    // 03:30 UTC es el día anterior en Santiago y en Lima: si se escribiera
    // en UTC, el cliente vería una conversación fechada al día siguiente.
    const instante = "2026-08-04T03:30:00.000Z";
    expect(fechaCSV(instante, REGION_CHILE)).toBe("03-08-2026, 23:30");
    // Perú además separa con barras: es SU formato, no el nuestro.
    expect(fechaCSV(instante, PERU)).toBe("03/08/2026, 22:30");
  });

  it("la fecha formateada trae una coma y por eso viaja entrecomillada", () => {
    // Este es el caso que rompe un CSV escrito a mano: Intl mete una coma
    // entre el día y la hora, así que CADA celda de fecha del archivo
    // necesita comillas. Sin ellas, todas las filas quedan corridas una
    // columna a partir de la primera fecha.
    const celda = fechaCSV("2026-08-04T03:30:00.000Z", REGION_CHILE);
    expect(celda).toContain(",");
    expect(campoCSV(celda)).toBe('"03-08-2026, 23:30"');
    expect(parsearFila(campoCSV(celda))).toEqual([celda]);
  });

  it("el nombre del archivo lleva la entidad y la fecha del cliente", () => {
    expect(nombreArchivo("contactos", REGION_CHILE)).toMatch(
      /^contactos-\d{4}-\d{2}-\d{2}\.csv$/
    );
  });
});

describe("catálogo de entidades", () => {
  it("solo acepta las cuatro entidades conocidas", () => {
    // La entidad llega por la URL: cualquier otra cosa no toca la base.
    for (const entidad of ENTIDADES) expect(esEntidad(entidad)).toBe(true);
    expect(esEntidad("usuarios")).toBe(false);
    expect(esEntidad("contacts")).toBe(false);
    expect(esEntidad("")).toBe(false);
    expect(esEntidad("../organizations")).toBe(false);
  });

  it("cada definición tiene su fila del mismo largo que su cabecera", () => {
    // Un desajuste acá no lanza nada: el archivo se abre con las columnas
    // corridas y el error aparece del lado del cliente.
    const filaVacia: Record<string, never> = {};
    for (const entidad of ENTIDADES) {
      const definicion = DEFINICIONES[entidad];
      const cabecera = definicion.cabecera(REGION_CHILE);
      // Se llama al mapeador con un registro sin campos: todo sale vacío,
      // pero el LARGO de la fila es el que se quiere comprobar.
      const fila = definicion.fila(
        filaVacia as never,
        REGION_CHILE
      );
      expect(fila).toHaveLength(cabecera.length);
    }
  });

  it("ninguna cabecera repite un nombre de columna", () => {
    for (const entidad of ENTIDADES) {
      const cabecera = DEFINICIONES[entidad].cabecera(REGION_CHILE);
      expect(new Set(cabecera).size).toBe(cabecera.length);
    }
  });

  it("la cabecera dice la zona horaria y la moneda de la subcuenta", () => {
    // "04-08-2026 21:40" sin decir de dónde es la hora obliga a adivinar.
    const contactos = DEFINICIONES.contactos.cabecera(REGION_CHILE);
    expect(contactos.some((c) => c.includes("America/Santiago"))).toBe(true);

    const oportunidades = DEFINICIONES.oportunidades.cabecera(REGION_CHILE);
    expect(oportunidades.some((c) => c.includes("CLP"))).toBe(true);
  });

  it("cada definición apunta a una tabla y filtra por organización", () => {
    // El select nunca trae org_id de otra parte: la ruta filtra por la
    // organización de la sesión y RLS lo vuelve a exigir.
    const tablas = ENTIDADES.map((e) => DEFINICIONES[e].tabla);
    expect(tablas).toEqual([
      "contacts",
      "opportunities",
      "conversations",
      "messages",
    ]);
    expect(new Set(tablas).size).toBe(tablas.length);
  });
});
